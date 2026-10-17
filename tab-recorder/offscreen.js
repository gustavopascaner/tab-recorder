let blinkTimer, blinkOn = true, recorder, vozRecorder, vozChunks = [], stream, micStream, audioCtx, fileHandle, writable, writeQueue;
const setState = state => chrome.runtime.sendMessage({ target: 'background', type: 'state', state });
const blink = () => { blinkOn = !blinkOn; chrome.runtime.sendMessage({ target: 'background', type: 'blink', on: blinkOn }); };
const TMP = 'recording-tmp.webm';

chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg.target !== 'offscreen') return;
  if (msg.type === 'start') {
    if (recorder) return;
    // 720p máx. y 15 fps: video más liviano, suficiente para una llamada
    const c = {
      chromeMediaSource: 'tab', chromeMediaSourceId: msg.streamId,
      maxWidth: 1280, maxHeight: 720, maxFrameRate: 15
    };
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: msg.streamId } },
      video: { mandatory: c }
    });
    const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = new AudioContext();
    const tabSrc = audioCtx.createMediaStreamSource(stream);
    const dest = audioCtx.createMediaStreamDestination();
    tabSrc.connect(dest);                                 // audio de la pestaña (los demás)
    audioCtx.createMediaStreamSource(mic).connect(dest);  // tu voz
    tabSrc.connect(audioCtx.destination);                 // seguir escuchando la pestaña (sin tu mic, evita eco)
    micStream = mic;
    // Pista aparte solo para transcribir: canal izquierdo = tu mic ("Gus"), derecho = pestaña ("Cliente")
    const merger = audioCtx.createChannelMerger(2);
    const vozDest = audioCtx.createMediaStreamDestination();
    vozDest.channelCount = 2; vozDest.channelCountMode = 'explicit';
    audioCtx.createMediaStreamSource(mic).connect(merger, 0, 0);
    tabSrc.connect(merger, 0, 1);
    merger.connect(vozDest);
    const out = new MediaStream([...stream.getVideoTracks(), ...dest.stream.getAudioTracks()]);

    // Escribir a disco (OPFS) a medida que se graba, en vez de acumular en RAM
    const root = await navigator.storage.getDirectory();
    fileHandle = await root.getFileHandle(TMP, { create: true });
    writable = await fileHandle.createWritable();
    writeQueue = Promise.resolve();

    recorder = new MediaRecorder(out, {
      mimeType: 'video/webm;codecs=vp9,opus', videoBitsPerSecond: 1e6, audioBitsPerSecond: 64e3
    });
    vozChunks = [];
    vozRecorder = new MediaRecorder(vozDest.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 64e3 });
    vozRecorder.ondataavailable = e => e.data.size && vozChunks.push(e.data);
    const vozStopped = new Promise(r => { vozRecorder.onstop = r; });
    recorder.ondataavailable = e => {
      if (e.data.size) writeQueue = writeQueue.then(() => writable.write(e.data));
    };
    recorder.onstop = async () => {
      clearInterval(blinkTimer);
      stream.getTracks().forEach(t => t.stop());
      micStream.getTracks().forEach(t => t.stop());
      audioCtx.close();
      recorder = null;
      await writeQueue;
      await writable.close();
      await vozStopped;
      const url = URL.createObjectURL(await fileHandle.getFile());
      const vozUrl = URL.createObjectURL(new Blob(vozChunks, { type: 'audio/webm' }));
      setState('idle');
      chrome.runtime.sendMessage({ target: 'background', type: 'save', url, vozUrl });
    };
    recorder.start(1000);
    blinkTimer = setInterval(blink, 600);
    vozRecorder.start(1000);
    setState('recording');
  } else if (msg.type === 'togglePause' && recorder) {
    if (recorder.state === 'recording') { clearInterval(blinkTimer); recorder.pause(); vozRecorder.pause(); setState('paused'); }
    else if (recorder.state === 'paused') { blinkTimer = setInterval(blink, 600); recorder.resume(); vozRecorder.resume(); setState('recording'); }
  } else if (msg.type === 'stop' && recorder) {
    recorder.stop(); vozRecorder.stop();
  } else if (msg.type === 'cleanup') {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(TMP).catch(() => {});
  }
});
