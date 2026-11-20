"""
Stateless FastAPI Inference Microservice for Kalbu.
Priority order for loading model:
1. ./kalbu-emotion-model/best (Fine-tuned DistilRoBERTa Transformer checkpoint)
2. ./ml/artifacts/kalbu_416k_pipeline.joblib (Calibrated 416k TF-IDF + SGD log-loss model)
3. Pretrained HuggingFace fallback checkpoint

Run with:
    uvicorn ml.serve_kalbu_api:app --host 127.0.0.1 --port 8000
"""

import json
import os
import joblib
from fastapi import FastAPI
from pydantic import BaseModel

LABEL_NAMES = ["sadness", "joy", "love", "anger", "fear", "surprise"]
TRANSFORMER_DIR = "./kalbu-emotion-model/best"
JOBLIB_MODEL_PATH = "./ml/artifacts/kalbu_416k_pipeline.joblib"
REPORT_PATH = "./ml/artifacts/evaluation_report.json"

app = FastAPI(title="Kalbu Stateless Emotion Inference API")

backend_type = "none"
joblib_pipeline = None
hf_tokenizer = None
hf_model = None

if os.path.isdir(TRANSFORMER_DIR):
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    print(f"[Kalbu Inference Server] Loading Transformer: {TRANSFORMER_DIR}")
    hf_tokenizer = AutoTokenizer.from_pretrained(TRANSFORMER_DIR)
    hf_model = AutoModelForSequenceClassification.from_pretrained(
        TRANSFORMER_DIR
    )
    hf_model.eval()
    backend_type = "transformer-distilroberta"
elif os.path.isfile(JOBLIB_MODEL_PATH):
    print(
        f"[Kalbu Inference Server] Loading 416k Calibrated Pipeline: {JOBLIB_MODEL_PATH}"
    )
    joblib_pipeline = joblib.load(JOBLIB_MODEL_PATH)
    backend_type = "kalbu-416k-calibrated-pipeline"
else:
    print(
        "[Kalbu Inference Server] Note: Run `python ml/run_416k_pipeline.py` first to generate the 416k model artifact."
    )


class AnalyzeRequest(BaseModel):
    text: str


@app.get("/model-info")
async def get_model_info():
    report = {}
    if os.path.isfile(REPORT_PATH):
        with open(REPORT_PATH, "r", encoding="utf-8") as f:
            report = json.load(f)
    return {"backend": backend_type, "evaluation": report}


@app.post("/predict")
async def predict_emotion(req: AnalyzeRequest):
    if backend_type == "kalbu-416k-calibrated-pipeline" and joblib_pipeline is not None:
        probs = joblib_pipeline.predict_proba([req.text.lower().strip()])[0]
        mapped = {
            LABEL_NAMES[idx]: round(float(p), 5) for idx, p in enumerate(probs)
        }
        del req
        return {"probabilities": mapped, "backend": backend_type}

    if backend_type == "transformer-distilroberta" and hf_model is not None:
        import torch

        inputs = hf_tokenizer(
            req.text, return_tensors="pt", truncation=True, max_length=256
        )
        with torch.no_grad():
            logits = hf_model(**inputs).logits
            probs = torch.softmax(logits, dim=-1).squeeze(0).tolist()
        mapped = {
            LABEL_NAMES[idx]: round(float(p), 5) for idx, p in enumerate(probs)
        }
        del req
        return {"probabilities": mapped, "backend": backend_type}

    return {"error": "Model artifact not loaded yet."}, 503
