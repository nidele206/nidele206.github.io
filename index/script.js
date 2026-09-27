
      (() => {
        "use strict";

        function getLanguageFromURL() {
          const path = window.location.pathname;
          if (path.includes("/i/en/")) return "en";
          if (path.includes("/i/zh/")) return "zh";
          if (path.includes("/i/ru/")) return "ru";
          if (path.includes("/i/hi/")) return "hi";
          if (path.includes("/i/kr/")) return "kr";
          if (path.includes("/i/kp/")) return "kp";
          if (path.includes("/i/zh-tw/")) return "zh-tw";
          return "ja";
        }

        const lang = getLanguageFromURL();

        const langNames = {
          ja: "日本語",
          en: "English",
          zh: "中文",
          "zh-tw": "繁体中文",
          ko: "한국어",
          kp: "조선어",
          ru: "русский",
          hi: "हिन्दी"
        };

        const langCurrentText = document.getElementById("lang-current-text");
        if (langCurrentText) {
          langCurrentText.innerHTML = `現在<b>${langNames[lang] || lang}ページ</b>を<br>閲覧中です。`;
        }

        const langDialogOverlay = document.createElement("div");
        langDialogOverlay.className = "lang-dialog-overlay";
        langDialogOverlay.id = "lang-dialog-overlay";

        const langDialog = document.createElement("div");
        langDialog.className = "lang-dialog";

        const langDialogH2 = document.createElement("h2");
        langDialogH2.textContent = "Language";
        langDialog.appendChild(langDialogH2);

        const langFlags = {
          ja: "🇯🇵", en: "🇬🇧", zh: "🇨🇳", "zh-tw": "🇨🇳",
          ko: "🇰🇷", kp: "🇰🇵", ru: "🇷🇺", hi: "🇮🇳"
        };

        const langHrefs = {
          ja: "https://nidele206.github.io/",
          en: "https://nidele206.github.io/i/en",
          zh: "https://nidele206.github.io/i/zh",
          "zh-tw": "https://nidele206.github.io/i/zh-tw",
          ko: "https://nidele206.github.io/i/ko",
          kp: "https://nidele206.github.io/i/kp",
          ru: "https://nidele206.github.io/i/ru",
          hi: "https://nidele206.github.io/i/hi"
        };

        Object.entries(langNames).forEach(([key, name]) => {
          const a = document.createElement("a");
          a.href = langHrefs[key] || "#";
          a.dataset.lang = key;
          const flag = document.createElement("span");
          flag.className = "lang-flag";
          flag.textContent = langFlags[key] || "";
          const langName = document.createElement("span");
          langName.className = "lang-name";
          langName.textContent = name;
          a.appendChild(flag);
          a.appendChild(langName);
          langDialog.appendChild(a);
        });

        document.body.appendChild(langDialogOverlay);
        langDialogOverlay.appendChild(langDialog);

        const langBtn = document.getElementById("lang-btn");
        if (langBtn && langDialogOverlay) {
          langBtn.addEventListener("click", () => {
            langDialogOverlay.classList.toggle("open");
          });
          langDialogOverlay.addEventListener("click", (e) => {
            if (e.target === langDialogOverlay) {
              langDialogOverlay.classList.remove("open");
            }
          });
        }

        document.querySelectorAll(".lang-dialog a").forEach((a) => {
          if (a.dataset.lang === lang) a.classList.add("current");
        });

        const productHrefs = {
          ja: "https://nidele206.github.io/product/ja/",
          en: "https://nidele206.github.io/product/en/",
          zh: "https://nidele206.github.io/product/zh/",
          "zh-tw": "https://nidele206.github.io/product/zh-tw/",
          ko: "https://nidele206.github.io/product/ko/",
          kp: "https://nidele206.github.io/product/kp/",
          ru: "https://nidele206.github.io/product/ru/",
          hi: "https://nidele206.github.io/product/hi/"
        };

        const products = [
          { path: "oneul-launcher", img: "https://nidele206.github.io/imgs/oneul-launcher.png", label: "Oneul launcher", bg: "#0070F9", desc: { ja: "より良い生活のためのランチャー", en: "A launcher for a better life", zh: "为更好生活而生的启动器", "zh-tw": "為更好生活而生的啟動器", ko: "더 나은 삶을 위한 런처", kp: "더 나은 삶을 위한 런처", ru: "Лаунчер для лучшей жизни", hi: "बेहतर जीवन के लिए लॉन्चर" } },
          { path: "wo-checker", img: "https://nidele206.github.io/imgs/wo-checker.png", label: "Wo Checker", bg: "#FFD53B", desc: { ja: "文章の誤字脱字をチェック", en: "Check typos and errors", zh: "检查文章中的错别字", "zh-tw": "檢查文章中的錯別字", ko: "글의 오타를 확인하세요", kp: "글의 오타를 확인하세요", ru: "Проверьте опечатки", hi: "टाइपो जांचें" } },
          { path: "easy-flowchart", img: "https://nidele206.github.io/imgs/easy-flowchart.png", label: "Easy Flowchart", bg: "#0090FF", desc: { ja: "簡単にフローチャートを作成", en: "Create flowcharts easily", zh: "轻松创建流程图", "zh-tw": "輕鬆創建流程圖", ko: "쉽게 플로우차트 만들기", kp: "쉽게 플로우차트 만들기", ru: "Легко создавать блок-схемы", hi: "आसानी से फ्लोचार्ट बनाएं" } }
        ];

        function isLightColor(hex) {
          const r = parseInt(hex.slice(1, 3), 16);
          const g = parseInt(hex.slice(3, 5), 16);
          const b = parseInt(hex.slice(5, 7), 16);
          const brightness = (r * 299 + g * 587 + b * 114) / 1000;
          return brightness > 128;
        }

        const productGrid = document.getElementById("product-grid");
        if (productGrid) {
          const baseHref = productHrefs[lang] || productHrefs.ja;
          products.forEach((product) => {
            const a = document.createElement("a");
            a.className = "product-link";
            a.href = baseHref + product.path;
            a.style.background = product.bg;
            const light = isLightColor(product.bg);
            a.style.color = light ? "#000" : "#fff";

            const img = document.createElement("img");
            img.src = product.img;
            img.alt = product.label;

            const label = document.createElement("span");
            label.className = "product-label";
            label.textContent = product.label;
            label.style.color = light ? "#000" : "#fff";

            const desc = document.createElement("span");
            desc.className = "product-desc";
            desc.textContent = product.desc[lang] || product.desc.ja;
            desc.style.color = light ? "#000" : "#fff";
            desc.style.opacity = "0.85";

            a.appendChild(img);
            a.appendChild(label);
            a.appendChild(desc);
            productGrid.appendChild(a);
          });
        }

        const footer = document.querySelector("footer");
        if (footer) {
          const adScript = document.createElement("script");
          adScript.async = true;
          adScript.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6151036058675874";
          adScript.crossOrigin = "anonymous";
          const adIns = document.createElement("ins");
          adIns.className = "adsbygoogle";
          adIns.style.display = "block";
          adIns.setAttribute("data-ad-format", "autorelaxed");
          adIns.setAttribute("data-ad-client", "ca-pub-6151036058675874");
          adIns.setAttribute("data-ad-slot", "6970356117");
          const adPush = document.createElement("script");
          adPush.textContent = "(adsbygoogle = window.adsbygoogle || []).push({});";
          footer.parentNode.insertBefore(adScript, footer);
          footer.parentNode.insertBefore(adIns, footer);
          footer.parentNode.insertBefore(adPush, footer);
        }

      })();
