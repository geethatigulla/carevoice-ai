# Bolna phone agent setup

CareVoice places real phone calls through a **Bolna** voice agent. The agent's conversation is
configured once in Bolna; CareVoice fills in the patient-specific parts on every call through
`user_data` variables.

## 1. Create the agent
1. Sign in at **https://platform.bolna.ai** → **Create new agent** → name it `CareVoice Appointment`.
2. **Language:** Telugu (or multilingual Telugu + Hindi + English). **Voice:** an Indian voice that
   supports Telugu (e.g. a Sarvam voice).
3. Turn on **call summary / summarization** if offered (CareVoice also writes its own summaries).
4. Paste the welcome message and prompt below, and **Save**.

### Welcome message
```
Namaskaram {patient_name} garu, {hospital_name} nundi matladutunnam.
```

### Prompt
```
You are the appointment assistant of {hospital_name}, calling {patient_name}.
Why you are calling: {call_purpose}
Their appointment on record: {appointment_details}

Doctor availability right now (from the hospital system):
{availability}

How to handle the call:
1. Confirm you are speaking to {patient_name}.
2. If they want an appointment or want to change one, tell them how many doctors are available ({doctor_count} in total), then offer at most two slots from the availability list, saying the doctor's name and time exactly as written.
3. Only offer slots from that list. Never invent doctors, times or prices.
4. When they choose, repeat the doctor and time and ask them to confirm. After a clear yes, say the appointment is booked and they will get a confirmation.
5. If they confirm their existing appointment, thank them and end politely.
Speak the patient's language (Telugu, Hindi or English) and mirror their mixing. Write Telugu words in Telugu script.
Use at most 2 short sentences per reply. Be respectful: say "garu" in Telugu and "ji" in Hindi.
Never give medical advice. If they describe an emergency, tell them to call 108 immediately.
```

## 2. Variables CareVoice sends (`user_data`)
| Variable | Example |
|---|---|
| `patient_name` | `Priya` |
| `hospital_name` | `Sunrise Multispeciality Hospital` |
| `appointment_details` | `with Dr. Ramesh Reddy (General Medicine) రేపు ఉదయం 10 గంటలకు, for Fever and body pains` |
| `call_purpose` | `Remind them about their upcoming appointment and ask if they will come…` |
| `availability` | `General Medicine — 2 doctor(s) available: • Dr. Ramesh Reddy (…): [S3] రేపు ఉదయం 9 గంటలకు; …` |
| `doctor_count` | `2` |
| `language` | `Telugu` |

The slot codes (`S1…Sn`) let CareVoice map the slot the patient agreed to back to the exact database
slot after the call.

## 3. Connect it to CareVoice
Put these in `backend/.env` (locally) and in Render's environment (deployed):
```
BOLNA_API_KEY=...        # Bolna → Developers → API Keys
BOLNA_AGENT_ID=...       # shown on the agent page (pasting the agent page URL also works)
```
Restart the backend after changing `.env`.

## Notes
- **Trial accounts can only call verified numbers.** Verify the numbers you test with in Bolna, or
  upgrade the account.
- CareVoice never receives webhooks from Bolna; it polls call status, so no public URL is needed.
