import modal

app = modal.App("kazakh-m2-cloud")
MODEL_DIR = "/models"
VOICE = "kk_KZ-issai-high"
MODEL_URL = "https://huggingface.co/rhasspy/piper-voices/resolve/main/kk/kk_KZ/issai/high/kk_KZ-issai-high.onnx"
CONFIG_URL = MODEL_URL + ".json"

image = (
    modal.Image.from_registry("nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04", add_python="3.11")
    .apt_install("espeak-ng")
    .pip_install("piper-tts", "onnxruntime-gpu", "fastapi[standard]", "requests")
    .run_commands(
        f"mkdir -p {MODEL_DIR}",
        f"python -c \"import requests; open('{MODEL_DIR}/{VOICE}.onnx','wb').write(requests.get('{MODEL_URL}').content); open('{MODEL_DIR}/{VOICE}.onnx.json','wb').write(requests.get('{CONFIG_URL}').content)\"",
    )
)

@app.function(
    image=image,
    gpu="T4",
    timeout=900,
    scaledown_window=300,
    max_containers=2,
)
@modal.fastapi_endpoint(method="POST")
def synthesize(payload: dict):
    import os
    import subprocess
    import tempfile
    from fastapi import HTTPException
    from fastapi.responses import Response

    text = str(payload.get("text", "")).strip()
    if not text:
        raise HTTPException(400, "text is required")
    if len(text) > 15000:
        raise HTTPException(413, "text exceeds 15000 characters")

    speed = float(payload.get("speed", 1.0))
    speed = max(0.85, min(1.15, speed))
    preset = str(payload.get("preset", "news"))
    length_scale = {
        "news": 0.96,
        "calm": 1.05,
        "bulletin": 0.90,
        "expressive": 0.98,
        "story": 1.03,
    }.get(preset, 0.96) / speed

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as output:
        output_path = output.name
    try:
        command = [
            "piper",
            "--model", f"{MODEL_DIR}/{VOICE}.onnx",
            "--output_file", output_path,
            "--cuda",
            "--length_scale", str(length_scale),
        ]
        completed = subprocess.run(
            command,
            input=text.encode("utf-8"),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=840,
        )
        if completed.returncode != 0:
            raise HTTPException(500, completed.stderr.decode("utf-8", errors="replace")[-1200:])
        with open(output_path, "rb") as handle:
            audio = handle.read()
        return Response(
            content=audio,
            media_type="audio/wav",
            headers={
                "Cache-Control": "no-store",
                "X-M2-Backend": "modal-gpu",
            },
        )
    finally:
        if os.path.exists(output_path):
            os.remove(output_path)
