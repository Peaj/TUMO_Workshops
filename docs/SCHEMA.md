# Data schema

All lesson content lives in `data/<workshop>/`. The app only reads these files, so adding
a workshop means adding a folder, not changing code.

Every user-visible string is a language pair: `{ "de": "...", "en": "..." }`.
German is the primary language (lessons are held in German).

## `data/<workshop>/workshop.json`

```json
{
  "id": "gd1",
  "title": { "de": "Game Development 1", "en": "Game Development 1" },
  "subtitle": { "de": "8 Sessions à 2 h", "en": "8 sessions, 2 h each" },
  "sessionMinutes": 120,
  "sessions": [1, 2, 3, 4, 5, 6, 7, 8]
}
```

## `data/<workshop>/session-<n>.json`

```json
{
  "id": 1,
  "title": { "de": "Kurzes Thema", "en": "Short theme" },
  "tumoTitle": { "de": "Original TUMO title", "en": "Original TUMO title" },
  "takeaway": { "de": "Ein Satz: Was nehmen die Teens heute mit?", "en": "..." },
  "slides": { "de": "https://docs.google.com/presentation/d/<id>", "en": "https://docs.google.com/presentation/d/<id>" },
  "source": { "de": "https://sites.google.com/...", "en": "https://sites.google.com/..." },
  "sections": [
    {
      "id": "1.2",
      "type": "presentation",
      "title": { "de": "Was ist ein Spiel?", "en": "What is a Game?" },
      "minutes": 10,
      "slide": 6,
      "anchor": { "de": "#h.8bzigouniydb", "en": "#h.abc" },
      "items": [
        { "kind": "ask", "text": { "de": "Frage: Was ist ein Spiel?", "en": "Ask: What is a game?" },
          "note": { "de": "Optionales Detail, erscheint beim Antippen.", "en": "Optional detail, shown on tap." } }
      ]
    }
  ]
}
```

### Rules

- `title`: 1-4 words naming what the session is really about ("Licht", "3Cs"), not "Session 3".
- `takeaway`: one sentence, what the Teens can do or know at the end.
- Section `minutes` of a session must sum to exactly `sessionMinutes` (120).
- `slide`: 1-based slide number where the section starts in the deck, or `null`.
- `anchor`: the `#h.…` fragment of the section heading on the source page, or `null`.
- `slides`: deck URL without `/edit`, `/present` or query string.

### Section `type` (minimap colour)

| type           | meaning                                   |
| -------------- | ----------------------------------------- |
| `presentation` | teacher presents / demonstrates           |
| `task`         | Teens work on their own                   |
| `review`       | recap of the previous session             |
| `wrapup`       | wrap-up at the end                        |
| `other`        | meet and greet, show and tell, organisation |

### Item `kind` (icon and colour)

| kind      | use for                                                        |
| --------- | -------------------------------------------------------------- |
| `explain` | explain a concept ("Directional Light erklären")               |
| `demo`    | show it live in Unity or on the projector                      |
| `ask`     | question or discussion with the group                          |
| `task`    | assignment for the Teens ("Aufgabe: Vertikalität ins Level")   |
| `check`   | walk around and verify something on the Teens' screens         |
| `warn`    | pitfall, common mistake, thing that is easily forgotten        |
| `save`    | save, upload, submit                                           |
| `info`    | organisational announcement                                    |

### Writing items

- One line, imperative, actionable. Aim for at most ~70 characters.
- 3-8 items per section. Only what would hurt if forgotten in a live lesson.
- `note` is optional and short (max two sentences): an example, a number, a quote.
- Written in our own words. Never copy sentences from the TUMO site.
- German follows `docs/GLOSSARY.md`: technical terms stay English.
