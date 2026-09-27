
(() => {
  "use strict";

  /*
    * URLから言語を検出。
    */
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

/*
    * 現在の言語を表示。
    */
    const langCurrentText = document.getElementById("lang-current-text");
    if (langCurrentText) {
      langCurrentText.innerHTML = `現在<b>${langNames[lang] || lang}</b>ページを<br>閲覧中です。`;
    }

/*
    * 言語ダイアログを動的に生成。
    */
    const langDialogOverlay = document.createElement("div");
    langDialogOverlay.className = "lang-dialog-overlay";
    langDialogOverlay.id = "lang-dialog-overlay";

    const langDialog = document.createElement("div");
    langDialog.className = "lang-dialog";

    const langDialogH2 = document.createElement("h2");
    langDialogH2.textContent = "Language";
    langDialog.appendChild(langDialogH2);

    const langFlags = {
      ja: "🇯🇵",
      en: "🇬🇧",
      zh: "🇨🇳",
      "zh-tw": "🇨🇳",
      ko: "🇰🇷",
      kp: "🇰🇵",
      ru: "🇷🇺",
      hi: "🇮🇳"
    };

    Object.entries(langNames).forEach(([key, name]) => {
      const a = document.createElement("a");
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

    langDialogOverlay.appendChild(langDialog);
    document.body.appendChild(langDialogOverlay);

/*
    * 言語ダイアログの切り替え。
    */
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

/*
    * ダイアログ内の現在の言語を強調。
    */
    document.querySelectorAll(".lang-dialog a").forEach(
      (a) => {
        const aLang = a.getAttribute("data-lang");
        if (aLang === lang) {
          a.classList.add("current");
        }
      }
    );

/*
          * プロダクトリンクを動的に生成。
          */
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
            {
              path: "oneul-launcher.html",
              img: "https://nidele206.github.io/imgs/oneul-launcher.png",
              label: "Oneul launcher"
            },
            {
              path: "wo-checker.html",
              img: "https://nidele206.github.io/imgs/wo-checker.png",
              label: "Wo Checker"
            },
            {
              path: "easy-flowchart.html",
              img: "https://nidele206.github.io/imgs/easy-flowchart.png",
              label: "Easy Flowchart"
            }
          ];

          const productGrid = document.getElementById("product-grid");
          if (productGrid) {
            const baseHref = productHrefs[lang] || productHrefs.ja;
            products.forEach((product) => {
              const a = document.createElement("a");
              a.className = "product-link";
              a.href = baseHref + product.path;

              const img = document.createElement("img");
              img.src = product.img;
              img.alt = product.label;

              const label = document.createElement("span");
              label.className = "product-label";
              label.textContent = product.label;

              a.appendChild(img);
              a.appendChild(label);
              productGrid.appendChild(a);
            });
          }

/*
    * フッターの前にAdSense広告を動的に挿入。
    */
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
