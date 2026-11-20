import os
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from datasets import Dataset, DatasetDict
from sklearn.metrics import classification_report, f1_score
from sklearn.model_selection import train_test_split
from sklearn.utils.class_weight import compute_class_weight
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    DataCollatorWithPadding,
    Trainer,
    TrainingArguments,
)

LABEL_NAMES = ["sadness", "joy", "love", "anger", "fear", "surprise"]
MODEL_CHECKPOINT = "distilroberta-base"


def resolve_primary_csv() -> str:
    candidates = [
        "emotions.csv/emotions.csv",
        "text.csv/text.csv",
        "data/emotions.csv",
        "emotions.csv",
    ]
    for path in candidates:
        if os.path.isfile(path):
            return path
    raise FileNotFoundError(
        "Could not locate emotions.csv or text.csv in workspace."
    )


def load_and_clean_splits(
    train_csv: str | None = None,
    val_csv: str = "data/validation.csv",
    test_csv: str = "data/test.csv",
) -> DatasetDict:
    primary_path = train_csv or resolve_primary_csv()
    print(f"[Kalbu ML] Loading primary 416k dataset from: {primary_path}")
    df_all = pd.read_csv(primary_path)[["text", "label"]].dropna()
    df_all["label"] = df_all["label"].astype(int)

    if os.path.isfile(val_csv) and os.path.isfile(test_csv):
        df_val = pd.read_csv(val_csv)[["text", "label"]].dropna()
        df_test = pd.read_csv(test_csv)[["text", "label"]].dropna()

        # Deduplicate & prevent leakage from validation/test into the 416k training set
        eval_texts = set(df_val["text"].str.strip().str.lower()).union(
            set(df_test["text"].str.strip().str.lower())
        )
        df_all["norm_text"] = df_all["text"].str.strip().str.lower()
        df_train = (
            df_all[~df_all["norm_text"].isin(eval_texts)]
            .drop_duplicates("norm_text")
            .drop(columns=["norm_text"])
        )
    else:
        print(
            "[Kalbu ML] Separate validation.csv/test.csv not found; creating stratified 90/5/5 splits from deduplicated 416k dataset..."
        )
        df_all["norm_text"] = df_all["text"].str.strip().str.lower()
        df_all = df_all.drop_duplicates("norm_text").drop(columns=["norm_text"])

        df_train, df_temp = train_test_split(
            df_all,
            test_size=0.10,
            stratify=df_all["label"],
            random_state=42,
        )
        df_val, df_test = train_test_split(
            df_temp,
            test_size=0.50,
            stratify=df_temp["label"],
            random_state=42,
        )

    print(
        f"[Kalbu ML] Clean split sizes -> Train: {len(df_train):,}, Val: {len(df_val):,}, Test: {len(df_test):,}"
    )
    return DatasetDict(
        {
            "train": Dataset.from_pandas(df_train, preserve_index=False),
            "validation": Dataset.from_pandas(df_val, preserve_index=False),
            "test": Dataset.from_pandas(df_test, preserve_index=False),
        }
    )


class WeightedEmotionTrainer(Trainer):
    def __init__(self, class_weights: torch.Tensor, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.class_weights = class_weights

    def compute_loss(self, model, inputs, return_outputs=False, **kwargs):
        labels = inputs.get("labels")
        outputs = model(**inputs)
        logits = outputs.get("logits")
        loss_fct = nn.CrossEntropyLoss(
            weight=self.class_weights.to(logits.device)
        )
        loss = loss_fct(
            logits.view(-1, self.model.config.num_labels), labels.view(-1)
        )
        return (loss, outputs) if return_outputs else loss


def compute_metrics(eval_pred):
    logits, labels = eval_pred
    preds = np.argmax(logits, axis=-1)
    return {
        "macro_f1": f1_score(labels, preds, average="macro"),
        "weighted_f1": f1_score(labels, preds, average="weighted"),
    }


if __name__ == "__main__":
    datasets = load_and_clean_splits()
    tokenizer = AutoTokenizer.from_pretrained(MODEL_CHECKPOINT)

    def tokenize_fn(batch):
        return tokenizer(batch["text"], truncation=True, max_length=128)

    tokenized = datasets.map(tokenize_fn, batched=True, remove_columns=["text"])

    # Compute balanced class weights for the 416k dataset
    y_train = np.array(tokenized["train"]["label"])
    weights = compute_class_weight("balanced", classes=np.arange(6), y=y_train)
    class_weights_tensor = torch.tensor(weights, dtype=torch.float)

    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_CHECKPOINT,
        num_labels=6,
        id2label={i: name for i, name in enumerate(LABEL_NAMES)},
        label2id={name: i for i, name in enumerate(LABEL_NAMES)},
    )

    args = TrainingArguments(
        output_dir="./kalbu-emotion-model",
        eval_strategy="epoch",
        save_strategy="epoch",
        learning_rate=2e-5,
        per_device_train_batch_size=64,
        per_device_eval_batch_size=128,
        num_train_epochs=3,
        weight_decay=0.01,
        fp16=torch.cuda.is_available(),
        load_best_model_at_end=True,
        metric_for_best_model="macro_f1",
    )

    trainer = WeightedEmotionTrainer(
        class_weights=class_weights_tensor,
        model=model,
        args=args,
        train_dataset=tokenized["train"],
        eval_dataset=tokenized["validation"],
        processing_class=tokenizer,
        data_collator=DataCollatorWithPadding(tokenizer),
        compute_metrics=compute_metrics,
    )

    trainer.train()

    # Final evaluation on held-out test split for FYP report
    test_output = trainer.predict(tokenized["test"])
    y_pred = np.argmax(test_output.predictions, axis=-1)
    print(
        classification_report(
            tokenized["test"]["label"],
            y_pred,
            target_names=LABEL_NAMES,
            digits=4,
        )
    )
    trainer.save_model("./kalbu-emotion-model/best")
    tokenizer.save_pretrained("./kalbu-emotion-model/best")
