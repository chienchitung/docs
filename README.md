# Data Machi

Data Machi 是一套聚焦企業實戰的 30 天學習系列，帶領讀者從 RAG、Tool Use、Agent 到 Agentic Workflow，逐步理解並設計可在企業環境中穩定運作的 AI 知識工作流。

本 repository 存放 Data Machi 網站的 Mintlify 文件內容與設定。

## 系列內容

30 天內容分為六個主題：

1. **AI 與工作**：企業 AI、知識工作、Prompt 與 Workflow
2. **企業知識檢索**：RAG、PDF 解析、語意搜尋與多模態文件
3. **工具整合**：Tool Use、LangChain、Google Sheets、Confluence 與 Trello
4. **Agent 決策**：ReAct、Coordinator、記憶、釐清與查核
5. **可控工作流**：LangGraph、平行執行、Multi-Agent 與 Human-in-the-loop
6. **企業級產品**：可靠性、Agent UX、安全、測試與部署

## 專案結構

```text
.
├── 30-days/          # Day 01–30 系列文章
├── logo/             # 淺色與深色模式 Logo
├── docs.json         # Mintlify 網站設定與導覽
├── favicon.svg       # 瀏覽器頁籤圖示
├── index.mdx         # 網站首頁
└── README.md
```

## 本機預覽

先安裝 Mintlify CLI：

```bash
npm install -g mint
```

在 repository 根目錄執行：

```bash
mint dev
```

接著開啟：

```text
http://localhost:3000
```

若本機版本過舊，可執行：

```bash
mint update
```

## 更新與發布

網站以 `main` 作為部署分支。內容提交並推送至 `main` 後，Mintlify 會自動偵測變更並更新正式網站。

新增或調整文章時，請同步確認：

- MDX 頁面的 `title`、`sidebarTitle` 與 `description`
- `docs.json` 中的 navigation 路徑與篇章分類
- 文章內部連結與上一頁、下一頁導覽
- 淺色與深色模式下的圖片及 Logo 顯示

## 技術

- Mintlify
- MDX
- GitHub
- RAG
- LangChain
- LangGraph
- Agentic Workflow

## 作者

**Chien-Chi Tung（Jackie Tung）**

專注於資料分析、商業洞察、AI 應用與企業知識工作流設計。

## License

本專案內容依 repository 中的 [LICENSE](./LICENSE) 授權條款使用。
