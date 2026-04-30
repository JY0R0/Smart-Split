# Emotion Predictor

A simple Streamlit app for predicting emotions from text using a trained scikit-learn pipeline.

**Project Overview**
- **Purpose:** Predict the emotion expressed in short text inputs (e.g., tweets, messages) and display prediction probabilities and an emoji.
- **Model:** A scikit-learn pipeline saved as `emotion_model.pkl` and loaded by the app.

**Quick Start**
- **Requirements:** Python 3.8+ and the packages in `requirements.txt`.
- **Install dependencies:**

```bash
python -m venv venv
venv\Scripts\activate      # Windows
# source venv/bin/activate  # macOS / Linux
pip install -r requirements.txt
```

- **Run the app:**

```bash
streamlit run app4.py
```

Open the browser window that Streamlit opens and type or paste text to see the predicted emotion and probabilities.

**Files**
- [app4.py](app4.py): Streamlit app that loads `emotion_model.pkl` and provides a web UI.
- [Final2.ipynb](Final2.ipynb): Jupyter notebook used for training and experimenting with the model.
- [training.csv](training.csv): Example dataset used for training (if present).
- [requirements.txt](requirements.txt): Python dependencies.
- `emotion_model.pkl` (not tracked): Saved model file required by `app4.py`.

**Training / Updating the Model**
1. Open and run the training notebook: `Final2.ipynb` (or your own training script).
2. After training, save the trained scikit-learn pipeline using `joblib`, for example:

```python
import joblib
# `pipeline` below represents your trained sklearn Pipeline
joblib.dump(pipeline, 'emotion_model.pkl')
```

Place the resulting `emotion_model.pkl` in the project root (next to `app4.py`). The Streamlit app will load it on startup.

**Usage Notes**
- `app4.py` expects a joblib-exported scikit-learn pipeline with `predict` and `predict_proba` methods and with `classes_` defined.
- If you change the pipeline classes or preprocessing, re-train and re-save the model so the web app shows correct labels.

**Troubleshooting**
- If you see `FileNotFoundError` for `emotion_model.pkl`, make sure the file exists in the same folder as `app4.py`.
- If package imports fail, re-check that the virtual environment is activated and `pip install -r requirements.txt` completed successfully.

**Contributing**
- Improvements, bug fixes, and pull requests are welcome. Please include reproducible steps and, when relevant, an updated notebook or training script.


