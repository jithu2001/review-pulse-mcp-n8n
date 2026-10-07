# Architecture

Two n8n workflows work together:

- **Main workflow** ([`workflows/review-pulse-workflow.json`](../workflows/review-pulse-workflow.json)) analyses reviews, builds the outputs, and waits for human approval.
- **MCP Server** ([`workflows/mcp-server.json`](../workflows/mcp-server.json)) exposes two tools, *append to Google Doc* and *create Gmail draft*, over MCP.

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

## Node map

| Diagram step | n8n node name |
|---|---|
| Form | `On form submission` |
| Step 1 · Review Intelligence | `Message a model` (GPT-4.1) |
| Step 2 · Weekly Product Pulse | `Message a model1` (GPT-4.1) |
| Step 3 · Fee Explainer | `Message a model2` (GPT-4.1 + Web Search) |
| Prepare Data | `Prepare Data` (Code): parses both JSON outputs, builds the Doc note, email subject/body and approval preview |
| Approval form | `Approval` (Form page, Decision dropdown + reviewer notes) |
| IF | `Approved?` (`Decision == "Approve"`) |
| AI Agent | `AI Agent` + `OpenAI Chat Model` (GPT-4.1, temperature 0) + `MCP Client` |
| End pages | `Logged` / `Rejected` |
