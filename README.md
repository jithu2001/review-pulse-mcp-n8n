# review-pulse-mcp

AI workflow in n8n that turns app reviews into a weekly product pulse and a fact-checked fee explainer, then logs them to Google Docs and drafts a Gmail email via MCP after human approval.

![n8n](https://img.shields.io/badge/n8n-workflow-EA4B71?logo=n8n&logoColor=white)
![MCP](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-000000)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4.1-412991?logo=openai&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

![Main workflow canvas](screenshots/01-main-workflow-canvas.png)

## What it does

Product teams get hundreds of app-store reviews a week, and the useful signal (recurring complaints, real user voice, confusion about fees) is buried in noise. **review-pulse-mcp** takes a reviews CSV, clusters it into themes, pulls out real quotes, and spots the fee or charge users are most confused about. It then writes a ≤250-word weekly product pulse and a short, source-backed fee explainer for support agents. Nothing is written anywhere until a human approves it. After approval, an AI agent uses MCP tools to append the note to a Google Doc and create a Gmail draft, which it never sends.

## Architecture

```mermaid
flowchart LR
    A[/"Form<br/>product name + reviews CSV"/] --> B[Extract from File]
    B --> C[Aggregate]
    C --> D["Step 1 · Review Intelligence<br/>≤5 themes · top 3 · 3 real quotes · 1 fee confusion"]
    D --> E["Step 2 · Weekly Product Pulse<br/>≤250 words · JSON"]
    D --> F["Step 3 · Fee Explainer<br/>≤6 bullets · 2 official sources · web search"]
    E --> G[Merge]
    F --> G
    G --> H["Prepare Data<br/>(Code node)"]
    H --> I[/"Approval form<br/>Approve / Reject"/]
    I --> J{Approved?}
    J -- Approve --> K["AI Agent<br/>+ OpenAI Chat Model"]
    J -- Reject --> R[/"Rejected<br/>nothing written"/]
    K <--> L["MCP Client"]
    K --> M[/"Logged"/]

    subgraph S["MCP Server workflow"]
        T["MCP Server Trigger<br/>(Bearer auth)"] --> U["Google Docs<br/>append note"]
        T --> V["Gmail<br/>create draft (never sent)"]
    end

    L -- "MCP over HTTP" --> T
```

More detail, including a map from diagram steps to n8n node names, is in [`docs/architecture.md`](docs/architecture.md).

## Features

- **Theme clustering**: groups all reviews into at most 5 themes and ranks the top 3.
- **Quote extraction**: 3 real user quotes, copied verbatim and never paraphrased.
- **Fee-confusion detection**: identifies the one fee or charge users are most confused about.
- **≤250-word weekly pulse**: top themes, quotes, key observation and 3 action ideas, returned as structured JSON.
- **Fee explainer with official sources**: ≤6 neutral, facts-only bullets, backed by 2 official sources found with web search (no blogs or third-party sites).
- **Human approval gate**: a reviewer sees the full preview and must approve before anything is written.
- **MCP logging**: an AI agent calls MCP tools to append the note to Google Docs and create a Gmail **draft**. Email is never sent.

## How to run

1. **Import both workflows** into n8n:
   - [`workflows/review-pulse-workflow.json`](workflows/review-pulse-workflow.json) (main)
   - [`workflows/mcp-server.json`](workflows/mcp-server.json) (MCP Server)
2. **Set up credentials** in n8n:
   - **OpenAI** on `Message a model`, `Message a model1`, `Message a model2` and `OpenAI Chat Model`
   - **Gmail OAuth2** on `Create a draft in Gmail` (MCP Server)
   - **Google Docs OAuth2** on `Update a document in Google Docs` (MCP Server). Also replace `YOUR_GOOGLE_DOC_URL` with your target Doc's URL.
3. **Add Bearer auth**: create one Bearer token credential and select it on **both** the `MCP Server Trigger` (Authentication → Bearer Auth) and the `MCP Client` (Authentication → Bearer Auth). They must use the same token.
4. **Activate the MCP Server workflow**, then copy the trigger's **Production URL**.
5. **Paste that URL** into the `MCP Client` node's Endpoint field, replacing `YOUR_MCP_ENDPOINT_URL`.
6. **Check Web Search** is enabled under Built-in Tools on `Message a model2` (the Fee Explainer).
7. **Activate or test the main workflow** and open the `On form submission` form URL.
8. **Upload the CSV.** Enter a product name, upload a reviews CSV (try [`data/flipkart-play-store-reviews.csv`](data/flipkart-play-store-reviews.csv)) and optionally paste official pricing or help URLs.
9. **Review the preview** on the Approval page and choose **Approve**. Then check your Google Doc and your Gmail Drafts folder.

## Where MCP approval happens

Approval happens on the **Approval form page**, which comes right after the `Prepare Data` node. The page shows the full Doc note, email subject and body, and the reviewer picks **Approve** or **Reject** (with optional notes).

- **Approve**: the `Approved?` IF node routes to the **AI Agent**, which calls the MCP tools (Google Docs append and Gmail draft).
- **Reject**: the workflow ends on the `Rejected` page. **Nothing is written** to Google Docs or Gmail.

The AI Agent and the MCP Client are only reachable through the Approve branch.

## Screenshots

| # | Screenshot | Caption |
|---|---|---|
| 1 | ![Main workflow canvas](screenshots/01-main-workflow-canvas.png) | Main workflow after a successful run: form → analysis → approval → AI Agent + MCP Client. |
| 2 | ![MCP Server canvas](screenshots/02-mcp-server-canvas.png) | MCP Server workflow exposing the Gmail draft and Google Docs update tools. |
| 3 | ![Upload form](screenshots/03-upload-form.png) | Upload form: product name, reviews CSV and optional official sources. |
| 4 | _TODO: add `screenshots/04-approval-form.png`_ | Approval page with the preview and Approve/Reject dropdown. |
| 5 | _TODO: add `screenshots/05-google-doc-entry.png`_ | Google Doc entry appended via MCP. Until then, see the [PDF export](outputs/weekly-pulse-flipkart-2026-10-07.pdf). |
| 6 | ![Gmail draft](screenshots/06-gmail-draft.png) | Gmail draft created via MCP: weekly pulse plus a reusable fee snippet. Not sent. |

## Fee issue identified from reviews

> **TODO (author):** describe the fee issue found in the reviews, in 2–3 sentences.
>
> For reference, the 2026-10-07 Flipkart run flagged *platform fees, additional charges and cancellation/return fees*. See [`outputs/weekly-pulse-flipkart-2026-10-07.md`](outputs/weekly-pulse-flipkart-2026-10-07.md).

## Deliverables

- [ ] Demo video: _TODO: add link_
- [x] Weekly pulse: [`outputs/weekly-pulse-flipkart-2026-10-07.md`](outputs/weekly-pulse-flipkart-2026-10-07.md) / [`.pdf`](outputs/weekly-pulse-flipkart-2026-10-07.pdf)
- [ ] Google Doc entry: [PDF export](outputs/weekly-pulse-flipkart-2026-10-07.pdf) available; screenshot `05-google-doc-entry.png` TODO
- [x] Gmail draft: [`screenshots/06-gmail-draft.png`](screenshots/06-gmail-draft.png)
- [x] CSV sample: [`data/flipkart-play-store-reviews.csv`](data/flipkart-play-store-reviews.csv)
- [ ] Sources: [`docs/sources.md`](docs/sources.md) (3 of 4–6 filled)
- [x] README

## Repo structure

```
review-pulse-mcp/
├── README.md
├── LICENSE
├── .gitignore
├── workflows/
│   ├── review-pulse-workflow.json   # main n8n workflow
│   └── mcp-server.json              # MCP Server (Google Docs + Gmail tools)
├── screenshots/
│   ├── 01-main-workflow-canvas.png
│   ├── 02-mcp-server-canvas.png
│   ├── 03-upload-form.png
│   └── 06-gmail-draft.png
├── data/
│   ├── README.md
│   └── flipkart-play-store-reviews.csv
├── outputs/
│   ├── README.md
│   ├── weekly-pulse-flipkart-2026-10-07.md
│   └── weekly-pulse-flipkart-2026-10-07.pdf
└── docs/
    ├── architecture.md
    └── sources.md
```

## License

[MIT](LICENSE) © 2026 Jithu J george
