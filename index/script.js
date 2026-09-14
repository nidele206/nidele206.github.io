
      (() => {
        "use strict";

        const creativeMessage =
          document.getElementById(
            "creative-message"
          );

        const creativeTitle =
          document.getElementById(
            "creative-title"
          );

        if (!creativeMessage) {
          console.error(
            "[NIDELE] creative-message element not found."
          );
          return;
        }

        if (!creativeTitle) {
          console.error(
            "[NIDELE] creative-title element not found."
          );
          return;
        }

        /*
         * 表示する文章。
         *
         * 「創造性が続くこと」だけ
         * accent=true にする。
         */
        const messageParts = [
          {
            text: "終わりなく",
            accent: false
          },
          {
            text: "創造性が続くこと",
            accent: true
          },
          {
            text: "を願います",
            accent: false
          }
        ];

        const fragment =
          document.createDocumentFragment();

        if (!fragment) {
          console.error(
            "[NIDELE] Failed to create document fragment."
          );
          return;
        }

        let generatedCharacters = 0;

        messageParts.forEach(
          (
            part,
            partIndex
          ) => {

            if (
              !part ||
              typeof part.text !==
                "string"
            ) {
              console.error(
                `[NIDELE] Invalid message part. index=${partIndex}`
              );
              return;
            }

            const characters =
              Array.from(
                part.text
              );

            if (
              characters.length === 0
            ) {
              console.error(
                `[NIDELE] Empty message part. index=${partIndex}`
              );
              return;
            }

            characters.forEach(
              (
                character,
                characterIndex
              ) => {

                const span =
                  document.createElement(
                    "span"
                  );

                if (!span) {
                  console.error(
                    `[NIDELE] Failed to create character element. part=${partIndex}, index=${characterIndex}`
                  );
                  return;
                }

                span.className =
                  "creative-message-char";

                if (
                  part.accent
                ) {
                  span.classList.add(
                    "accent"
                  );
                }

                span.textContent =
                  character;

                fragment.appendChild(
                  span
                );

                generatedCharacters++;
              }
            );

            /*
             * 文節間のスペース。
             */
            if (
              partIndex <
              messageParts.length - 1
            ) {

              const space =
                document.createElement(
                  "span"
                );

              if (!space) {
                console.error(
                  `[NIDELE] Failed to create spacing element. part=${partIndex}`
                );
                return;
              }

              space.className =
                "creative-message-char";

              space.textContent =
                "\u00A0";

              fragment.appendChild(
                space
              );

              generatedCharacters++;
            }
          }
        );

        if (
          generatedCharacters === 0
        ) {
          console.error(
            "[NIDELE] No creative message characters generated."
          );
          return;
        }

        creativeMessage.appendChild(
          fragment
        );

        const messageCharacters =
          Array.from(
            creativeMessage.querySelectorAll(
              ".creative-message-char"
            )
          );

        if (
          messageCharacters.length === 0
        ) {
          console.error(
            "[NIDELE] Generated creative characters could not be retrieved."
          );
          return;
        }

        console.log(
          `[NIDELE] Creative intro initialized. characters=${messageCharacters.length}`
        );

        /*
         * 一文字ずつ出現。
         *
         * opacityは変更しない。
         * visibilityだけ切り替える。
         */
        const CHARACTER_INTERVAL = 85;

        /*
         * 文章全体の左→右移動時間。
         */
        const MESSAGE_DURATION = 1900;

        /*
         * メッセージ全体の移動距離。
         * CSSの初期値/終値と一致。
         */
        const isMobile =
          window.matchMedia(
            "(max-width: 720px)"
          ).matches;

        const startX =
          isMobile
            ? "-12vw"
            : "-8vw";

        const endX =
          isMobile
            ? "5vw"
            : "4vw";

        /*
         * 全体移動。
         *
         * ここではフェードを一切扱わない。
         */
        try {

          const messageAnimation =
            creativeMessage.animate(
              [
                {
                  transform:
                    `translateX(${startX})`
                },
                {
                  transform:
                    `translateX(${endX})`
                }
              ],
              {
                duration:
                  MESSAGE_DURATION,

                easing:
                  "linear",

                fill:
                  "forwards"
              }
            );

          if (!messageAnimation) {
            console.error(
              "[NIDELE] Message animation was not created."
            );
          } else {
            console.log(
              `[NIDELE] Message movement started. mobile=${isMobile}, duration=${MESSAGE_DURATION}ms`
            );
          }

        } catch (error) {

          console.error(
            "[NIDELE] Failed to start message movement animation.",
            error
          );
        }

        /*
         * 一文字ずつ出す。
         */
        messageCharacters.forEach(
          (
            character,
            index
          ) => {

            if (!character) {
              console.error(
                `[NIDELE] Character element missing. index=${index}`
              );
              return;
            }

            window.setTimeout(
              () => {

                character.classList.add(
                  "is-visible"
                );

                console.log(
                  `[NIDELE] Character displayed. index=${index}, value="${character.textContent}"`
                );

              },
              index *
                CHARACTER_INTERVAL
            );
          }
        );

        console.log(
          `[NIDELE] Character animation started. interval=${CHARACTER_INTERVAL}ms`
        );

        /*
         * 最後の一文字が出るまでの時間。
         */
        const lastCharacterTime =
          (
            messageCharacters.length - 1
          ) *
          CHARACTER_INTERVAL;

        /*
         * 文字表示または全体移動の
         * 長い方が終了するまで待つ。
         */
        const messageEnd =
          Math.max(
            MESSAGE_DURATION,
            lastCharacterTime + 70
          );

        /*
         * メッセージ完了後、
         * 少しだけ間を置いてタイトル。
         */
        const TITLE_DELAY = 180;

        const titleStartTime =
          messageEnd +
          TITLE_DELAY;

        console.log(
          `[NIDELE] Title animation scheduled. delay=${titleStartTime}ms`
        );

        window.setTimeout(
          () => {

            if (!creativeTitle) {
              console.error(
                "[NIDELE] creative-title element unavailable."
              );
              return;
            }

            creativeTitle.classList.add(
              "is-visible"
            );

            console.log(
              "[NIDELE] Title animation started."
            );

          },
          titleStartTime
        );

        console.log(
          "[NIDELE] Creative intro setup completed."
        );

      })();