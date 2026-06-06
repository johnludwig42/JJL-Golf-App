# Supabase Edge Function: scorecard-import

v27.42 supports the browser workflow for AI-assisted scorecard imports. The PWA calls a backend endpoint so API keys are not exposed in client-side code.

## Expected endpoint

By default, the app calls:

```text
<SUPABASE_URL>/functions/v1/scorecard-import
```

You may override this by adding `scorecardImportEndpoint` to `supabase-config.js`.

## Expected request

```json
{
  "fileName": "scorecard.jpg",
  "mimeType": "image/jpeg",
  "dataUrl": "data:image/jpeg;base64,...",
  "requestedSchema": "the-dye-ledger-scorecard-v1"
}
```

## Expected response

```json
{
  "course": {
    "courseName": "Chatham Hills",
    "city": "Westfield",
    "state": "IN",
    "country": "United States of America",
    "holeCount": 18,
    "totalPar": 72,
    "confidence": 96,
    "uncertainFields": ["Hole 7 Handicap"],
    "holes": [
      { "holeNumber": 1, "par": 4, "handicapIndex": 7 }
    ],
    "tees": [
      {
        "teeName": "Blue",
        "totalYardage": 6725,
        "rating": 72.4,
        "slope": 139,
        "holes": [
          { "holeNumber": 1, "yardage": 410, "par": 4, "handicapIndex": 7 }
        ]
      }
    ]
  }
}
```

## Implementation guidance

Use a Supabase Edge Function or other backend service that calls a vision-capable model. Do not put model API keys in `supabase-config.js` or any client-side file.

The edge function should return JSON only, conforming to the schema above. For PDFs, render pages or pass supported file content to the vision service and merge scorecard data across pages before returning the response.


## v27.42 multi-file payload

The Edge Function should also accept:

```json
{
  "files": [
    {
      "fileName": "front-nine.jpg",
      "mimeType": "image/jpeg",
      "dataUrl": "data:image/jpeg;base64,...",
      "label": "Front / Page 1"
    },
    {
      "fileName": "back-nine.jpg",
      "mimeType": "image/jpeg",
      "dataUrl": "data:image/jpeg;base64,...",
      "label": "Back / Page 2"
    }
  ],
  "requestedSchema": "the-dye-ledger-scorecard-v1"
}
```

The v27.42 zip includes updated deployable Edge Function code at `supabase/functions/scorecard-import/index.ts`.
