# InterviewArena GEC v2 — final training pipeline

## Files
- `audit_dataset.py` — verifies JSONL integrity, duplicates and source leakage.
- `train_gec_v2.py` — fine-tunes `Unbabel/gec-t5_small` without touching checkpoint-1270.
- `evaluate_gec_v2.py` — evaluates the untouched test set and writes `evaluation_v2.json`.
- `requirements-gec-v2.txt` — compatible package set.

## Windows CMD

Run from the `ml-service` folder:

```cmd
python audit_dataset.py --train data\train_clean.jsonl --validation data\validation_clean.jsonl --test data\test.jsonl --out data\gec_audit.json
```

GPU training (RTX 2050 4GB):

```cmd
python train_gec_v2.py --train data\train_clean.jsonl --validation data\validation_clean.jsonl --base-model Unbabel/gec-t5_small --output models\interviewarena-gec-v2 --epochs 6 --lr 0.00001
```

After training:

```cmd
python evaluate_gec_v2.py --model models\interviewarena-gec-v2 --test data\test.jsonl --out evaluation_v2.json --beams 4
```

## Important
- Original datasets are never modified.
- Old `models\interviewarena-gec\checkpoint-1270` is never overwritten.
- The model input prefix is `gec:`, matching `Unbabel/gec-t5_small`.
- Test data is used only by the evaluation script, never for training.
- Do not claim a target accuracy before `evaluation_v2.json` is produced.
- If v2 is still weak, inspect the error categories before another training run; do not blindly increase epochs.
