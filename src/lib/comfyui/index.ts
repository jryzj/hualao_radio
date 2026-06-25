import { getComfyUIConfig } from "@/config";
import { prisma } from "@/lib/prisma";
import { recordGenerationSurplus } from "@/lib/live-engine";
import { parseWavDurationMs } from "@/lib/audio/wav-duration";
import fs from "fs";
import path from "path";

// Global state to check if we should stop polling
const globalState = globalThis as unknown as { shouldStop?: boolean };

function comfyHeaders(token: string): Record<string, string> {
  return token
    ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

async function pollHistory(promptId: string, serverUrl: string, token: string, maxWaitMs = 120000): Promise<Record<string, unknown> | null> {
  const start = Date.now();
  console.log(`[comfyui] polling ${promptId} at ${serverUrl}`);
  while (Date.now() - start < maxWaitMs) {
    // Check if live engine was stopped
    if (globalState.shouldStop) {
      console.log(`[comfyui] poll aborted due to stop, promptId: ${promptId}`);
      return null;
    }
    try {
      const res = await fetch(`${serverUrl}/api/history/${promptId}`, {
        headers: comfyHeaders(token),
      });
      if (res.ok) {
        const data = await res.json();
        console.log(`[comfyui] poll response keys:`, Object.keys(data));
        if (data[promptId]) {
          console.log(`[comfyui] history entry found for ${promptId}`);
          return data[promptId];
        }
      } else {
        console.log(`[comfyui] poll HTTP ${res.status}`);
      }
    } catch (e) { console.log(`[comfyui] poll error:`, e); }
    await new Promise( r => setTimeout(r, 2000));
  }
  console.log(`[comfyui] poll timed out for ${promptId}`);
  return null;
}

// Submit a single sentence TTS, returns the promptId on success or null on
// failure. Side effect: on success, polls the history endpoint and broadcasts
// the resulting audio over WebSocket. The promptId is returned synchronously
// (after submission) so callers can poll independently if they want.
export async function submitOmniVoiceJob(
  text: string,
): Promise<string | null> {
  console.log('[comfyui] submitOmniVoiceJob called with text:', text.substring(0, 30));
  // L1 start: the moment the engine asks us to produce this segment.
  // L1 end is captured inside broadcastAudioNode, just before the
  // wsBroadcast call. (L2 − L1) is fed into the live-engine's
  // generation-surplus accumulator so it can self-throttle when LLM
  // + TTS is consistently faster than the client can consume.
  const submittedAt = Date.now();
  const config = await getComfyUIConfig();
  if (!config) return null;

  const sentence = text.trim();
  if (!sentence) return null;

  const theme = await prisma.theme.findFirst({ where: { isActive: true }, include: { workflow: true } });
  const workflow = theme?.workflow;
  const speed = workflow?.speed ?? 1.0;
  const refAudioPath = workflow?.refAudioPath ?? null;

  const workflowFileName = refAudioPath
    ? "my_omnivoice-tts_clone_api.json"
    : "my_omnivoice-tts_api.json";
  const workflowPath = path.join(process.cwd(), "workflows", workflowFileName);
  let workflowJson: Record<string, unknown>;
  try {
    const raw = fs.readFileSync(workflowPath, "utf-8");
    workflowJson = JSON.parse(raw);
  } catch (err) {
    console.error('[comfyui] failed to load workflow:', workflowPath, err);
    return null;
  }

  // Clone workflow: 上传本地参考音频到 ComfyUI 的 input/ 目录，拿返回的文件名注入节点 38
  if (refAudioPath) {
    const localAbs = path.join(process.cwd(), "public", refAudioPath);
    if (!fs.existsSync(localAbs)) {
      console.error("[comfyui] ref audio file missing:", localAbs);
      return null;
    }
    try {
      const buffer = fs.readFileSync(localAbs);
      const uploadForm = new FormData();
      uploadForm.append("image", new Blob([buffer]), path.basename(localAbs));
      uploadForm.append("type", "input");
      uploadForm.append("overwrite", "true");
      const uploadHeaders: Record<string, string> = {};
      if (config.comfyuiToken) {
        uploadHeaders.Authorization = `Bearer ${config.comfyuiToken}`;
      }
      const uploadRes = await fetch(`${config.serverUrl}/api/upload/image`, {
        method: "POST",
        headers: uploadHeaders,
        body: uploadForm,
      });
      if (!uploadRes.ok) {
        console.error("[comfyui] ref audio upload failed:", uploadRes.status, await uploadRes.text().catch(() => ""));
        return null;
      }
      const uploadData = await uploadRes.json() as { name?: string };
      const comfyFilename = uploadData.name ?? path.basename(localAbs);

      const node38 = workflowJson["38"] as Record<string, unknown>;
      const node38Inputs = node38["inputs"] as Record<string, unknown>;
      node38Inputs["audio"] = comfyFilename;
      delete node38Inputs["audioUI"];
      console.log(`[comfyui] ref audio uploaded: ${comfyFilename}`);

      // 注入 ref_text 到节点 35（仅 Clone 工作流有此字段）
      if (workflow?.refText) {
        const node35 = workflowJson["35"] as Record<string, unknown>;
        const node35Inputs = node35["inputs"] as Record<string, unknown>;
        node35Inputs["ref_text"] = workflow.refText;
        console.log(`[comfyui] ref_text injected (${workflow.refText.length} chars)`);
      }

      // 注入 instruct 到节点 35（仅 Clone 工作流，与 voice_instruct 是不同字段，
      // 后者是 Voice Design 工作流的必填项，此处不动）
      if (workflow?.instruct) {
        const node35 = workflowJson["35"] as Record<string, unknown>;
        const node35Inputs = node35["inputs"] as Record<string, unknown>;
        node35Inputs["instruct"] = workflow.instruct;
        console.log(`[comfyui] instruct injected (${workflow.instruct.length} chars)`);
      }
    } catch (err) {
      console.error("[comfyui] ref audio upload error:", err);
      return null;
    }
  }

  // 节点 35：text + speed（保留工作流原 voice_instruct，因为 OmniVoiceVoiceDesignTTS
  // 把该字段视为必填；删掉会导致 ComfyUI 报 400 "Required input is missing"）
  const node35 = workflowJson["35"] as Record<string, unknown>;
  const inputs = node35["inputs"] as Record<string, unknown>;
  inputs["text"] = sentence;
  inputs["speed"] = speed;

  let promptId: string | null = null;
  try {
    const response = await fetch(`${config.serverUrl}/api/prompt`, {
      method: "POST",
      headers: comfyHeaders(config.comfyuiToken),
      body: JSON.stringify({ prompt: workflowJson }),
    });
    const data = await response.json();
    if (!response.ok) {
      console.error(`[comfyui] submit failed: HTTP ${response.status}`, JSON.stringify(data).substring(0, 500));
      return null;
    }
    promptId = (data.prompt_id as string | undefined) ?? null;
    if (!promptId) {
      console.error("[comfyui] submit response missing prompt_id:", JSON.stringify(data).substring(0, 500));
      return null;
    }

    console.log(`[comfyui] submitted prompt_id: ${promptId}`);

    // Poll for completion and broadcast
    const timeoutMs = config.pollTimeoutMs ?? 120000;
    const entry = await pollHistory(promptId, config.serverUrl, config.comfyuiToken, timeoutMs);
    if (!entry || globalState.shouldStop) return promptId;

    await broadcastAudioNode(entry, config, submittedAt);
    return promptId;
  } catch (e) {
    console.error('[comfyui] submitOmniVoiceJob error:', e);
    return promptId;
  }
}

async function broadcastAudioNode(
  entry: Record<string, unknown>,
  config: NonNullable<Awaited<ReturnType<typeof getComfyUIConfig>>>,
  submittedAt?: number,
) {
  const outputs = entry["outputs"] as Record<string, unknown> | undefined;
  if (!outputs) return;
  const node2Output = outputs["2"] as Record<string, unknown> | undefined;
  if (!node2Output) return;
  const audioArr = node2Output["audio"] as unknown[];
  if (!audioArr || audioArr.length === 0) return;
  const audioInfo = audioArr[0] as { filename: string; subfolder: string; type: string };
  try {
    const viewUrl = `${config.serverUrl}/api/view?filename=${encodeURIComponent(audioInfo.filename)}&subfolder=${encodeURIComponent(audioInfo.subfolder)}&type=${audioInfo.type}`;
    const res = await fetch(viewUrl, { headers: comfyHeaders(config.comfyuiToken) });
    if (res.ok) {
      const audioBuffer = Buffer.from(await res.arrayBuffer());
      // L1 end: the audio is fully downloaded and is about to be
      // pushed to clients. Report (L2 − L1) to the engine's
      // surplus accumulator so it can self-throttle when the
      // server outpaces the player. parseWavDurationMs returns null
      // for non-WAV / non-PCM blobs (defensive — omni-voice always
      // produces PCM WAV, but we don't want to crash if the
      // workflow changes).
      if (typeof submittedAt === "number") {
        const L1 = Date.now() - submittedAt;
        const L2 = parseWavDurationMs(audioBuffer);
        if (L2 !== null) {
          recordGenerationSurplus(L1, L2);
        } else {
          // Include the actual audioFormat (offset 20 in the WAV
          // header) and buffer length so we can tell at a glance
          // whether we're hitting IEEE-float (3), extensible
          // (0xFFFE), A-law (6), μ-law (7), or a truncated buffer.
          // parseWavDurationMs only supports PCM (1) and IEEE
          // float (3) — anything else lands here.
          const audioFormat = audioBuffer.length >= 22
            ? audioBuffer.readUInt16LE(20)
            : -1;
          const riff = audioBuffer.subarray(0, 4).toString("ascii");
          const wave = audioBuffer.subarray(8, 12).toString("ascii");
          console.warn(
            `[comfyui] could not parse WAV duration from segment; ` +
            `skipping surplus update (riff="${riff}" wave="${wave}" ` +
            `audioFormat=${audioFormat} bytes=${audioBuffer.length})`,
          );
        }
      }
      const base64 = audioBuffer.toString('base64');
      await import("@/lib/ws-server").then(m => m.wsBroadcast(base64));
      console.log('[comfyui] broadcast sentence, size:', audioBuffer.length);
    }
  } catch (e) {
    console.error('[comfyui] broadcast failed:', e);
  }
}

export async function submitTTSJob(workflowJson: string, text: string): Promise<string | null> {
  const config = await getComfyUIConfig();
  if (!config) return null;

  const inputParams = JSON.parse(workflowJson);
  inputParams["35"] = { inputs: { ...inputParams["35"]?.inputs, text } };

  try {
    const response = await fetch(`${config.serverUrl}/api/prompt`, {
      method: "POST",
      headers: comfyHeaders(config.comfyuiToken),
      body: JSON.stringify({ prompt: inputParams }),
    });
    const data = await response.json();
    return data.prompt_id ?? null;
  } catch {
    return null;
  }
}