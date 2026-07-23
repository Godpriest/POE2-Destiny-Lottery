🎰 PoE2 Destiny Lottery - 專案架構與開發設計紀錄本專案是一個基於 Path of Exile 2 (PoE2) 暗黑風格打造的動態抽獎與過濾工具。前端採用純 HTML/CSS/JavaScript 開發，後端結合 CDN 圖片加速與 Discord Webhook 自動化推播機制。🛠️ 1. 系統整體架構 (System Architecture)Plaintext[ 靜態資源 (CDN) ] ──> Backblaze B2 (儲存原圖) ──> Cloudflare Worker / CDN (加速/代理)
                                                                 │
[ 資料層 (Data) ]    ──> data/pools.json (動態獎池、權重、中英文 mapping)
                                                                 │
[ 前端介面 (UI) ]   ──> index.html + style.css + js/main.js (渲染與動畫)
                                                                 │
[ 自動化 (Webhook)] ──> 抽獎結果 ──> Discord Webhook (自動發送中獎卡片)
🖼️ 2. 靜態資源與圖床配置 (Image Asset Hosting)為了避免將大量高解析度圖檔直接放在 GitHub Repository 導致載入緩慢或超出容量限制，本專案採用 B2 + Cloudflare CDN 方案：Backblaze B2：作為底層圖床，存放 img_character/ 底下的所有角色小圖 (icon) 與大圖 (character 立繪)。Cloudflare CDN / Proxy：綁定自訂域名/代理，為圖片提供免費加速與快取，大幅縮短前端載入延遲。路徑慣例化 (Convention over Configuration)：角色圖示預設路徑：img_character/icon/icon_{id}.webp角色立繪預設路徑：img_character/character/{id}.webp📂 3. 資料與邏輯分離 (Data Driven Architecture)所有的獎池資料皆抽離至 data/pools.json 中，達成「新增素材免改程式碼」的目標。📄 data/pools.json 結構範例：JSON{
  "Character": [
    {
      "id": "sorceress",
      "name": {
        "zh-TW": "女術士",
        "en": "Sorceress"
      },
      "weight": 1,
      "iconPath": "img_character/icon/icon_sorceress.webp",
      "portraitPath": "img_character/character/sorceress.webp",
      "discordImage": "https://cdn.discordapp.com/attachments/..."
    }
  ],
  "Ascendancy": [ ... ],
  "Weapon": [ ... ]
}
🔑 關鍵欄位說明：id：項目的唯一識別碼（全小寫 + 底線）。name：支援多語言對照（目前包含 zh-TW 與 en）。weight：抽獎權重（預設為 1）。iconPath / portraitPath：自訂圖片相對路徑（若留空則自動代入慣例路徑）。discordImage：中獎時推播至 Discord 的高畫質圖案連結（具備防呆機制，若未填寫則只發送純文字訊息）。⚙️ 4. 核心機制與技術優化🎲 A. 權重抽獎引擎 (Weighted Random Selection)抽獎機制並非簡單的 Math.random() 索引隨機，而是採用「權重累加法」：算出一池內所有項目的 weight 加總值 $S$。在 $0 \sim S$ 之間產生一個隨機浮點數 $R$。依序累加項目的權重，當累加值大於等於 $R$ 時，即選定該項目。效益：未來若要加入「極稀有/傳奇」物品，只需將該項目的 weight 設為 0.1 即可，不需破壞陣列結構。⚡ B. 全自動動態預載機制 (Dynamic Image Preloading)為了防止玩家在點擊抽獎或切換獎池時出現圖片白塊與閃爍：當 main.js 透過 fetch() 成功讀取 pools.json 後，會立刻啟動 collectPoolImageAssets()。自動遍歷 Character、Ascendancy、Weapon 所有獎池，提取 iconPath 與 portraitPath 進行 URL 去重。建立 Image() 物件於背景完成非同步下載，並在 Console 輸出預載統計與異常 Warning。🌐 C. 多語言與 UI 動態渲染 (I18n & Filter Mapping)透過 TRANSLATIONS 物件映射表，在切換獎池按鈕時，自動觸發 updateFilterTitle()。例如切換至 Ascendancy 時，過濾器標題會動態由 HTML 渲染為「昇華過濾器」，達到完全的中英邏輯分離。🚀 5. GitHub Pages 部署防呆與注意事項Jekyll 衝突處理 (.nojekyll)：GitHub Pages 預設會使用 Jekyll 編譯網站，並忽略底線開頭或特定資料夾（如 data/）。解決方案：在專案根目錄放一個完全空白的 .nojekyll 檔案，告知 GitHub 採用純靜態 HTML 發布。CORS 本地測試限制：瀏覽器在 file:// 本地協議下會阻擋 JavaScript 發送 fetch() 讀取本地 pools.json。解決方案：本地開發時請務必使用 VS Code / Cursor 的 Live Server 擴充套件啟動（[http://127.0.0.1:5500](http://127.0.0.1:5500)）；正式部署上傳至 GitHub Pages 後 CORS 限制將自動解除。📝 6. 未來新增素材 SOP (Workflow for Adding New Items)日後若有全新角色、昇華或武器要加入，只需執行以下三步驟：上傳圖檔：將角色小圖與立繪上傳至 B2 儲存庫對應資料夾。填寫 JSON：在 data/pools.json 對應的陣列中新增一筆資料：JSON{
  "id": "your_item_id",
  "name": { "zh-TW": "中文名稱", "en": "English Name" },
  "weight": 1,
  "iconPath": "img_character/icon/icon_your_item_id.webp",
  "portraitPath": "img_character/character/your_item_id.webp",
  "discordImage": "https://..."
}
Commit & Push：推送到 GitHub，網頁重新整理後即會自動載入新卡片、自動加入過濾器並完成圖片預載！
