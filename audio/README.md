# Audio files

Drop your **9 pre-generated voice MP3s** into this folder. Filenames must match
**exactly** (the buttons are wired to these paths):

```
01_guest_welcome.mp3
02_groom_entrance.mp3
03_bride_entrance.mp3
04a_quran_ar_rum_30_21_verified.mp3
04b_nikkah_english_announcement.mp3
05_qubool_and_signing.mp3
06_food_service.mp3
07_cake_cutting.mp3
08_ruksati_preparation.mp3
```

Notes:
- `04a` + `04b` play back-to-back from a single **"Ceremony / Nikkah"** button
  (Quran recitation → English Nikkah announcement).
- If a file is missing, its button shows a clear error and a toast — it never
  hangs the app, and all other cues + STOP keep working.
- These are **static local assets**. Do not wire them to any TTS / ElevenLabs API.
