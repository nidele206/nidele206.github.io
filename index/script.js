
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

         /*
          * .product-linkのhrefからLANGUAGEを現在の言語に置換。
          */
         document.querySelectorAll(".product-link").forEach(
           (link) => {
             const href = link.getAttribute("href");
             if (href && href.includes("LANGUAGE")) {
               link.setAttribute("href", href.replaceAll("LANGUAGE", lang));
             }
           }
         );

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
