import { module, test } from "qunit";
import { setupRenderingTest } from "discourse/tests/helpers/component-test";
import { render } from "@ember/test-helpers";
import { query } from "discourse/tests/helpers/qunit-helpers";
import { hbs } from "ember-cli-htmlbars";
import pretender from "discourse/tests/helpers/create-pretender";
import { resetCache } from "pretty-text/upload-short-url";

module("Integration | Component | cook-text", function (hooks) {
  setupRenderingTest(hooks);

  hooks.afterEach(function () {
    resetCache();
  });

  test("renders markdown", async function (assert) {
    await render(hbs`<CookText @rawText="_foo_" @class="post-body" />`);

    const html = query(".post-body").innerHTML.trim();
    assert.strictEqual(html, "<p><em>foo</em></p>");
  });

  test("resolves short URLs", async function (assert) {
    pretender.post("/uploads/lookup-urls", () => {
      return [
        200,
        { "Content-Type": "application/json" },
        [
          {
            short_url: "upload://a.png",
            url: "/images/avatar.png",
            short_path: "/images/d-logo-sketch.png",
          },
        ],
      ];
    });

    await render(
      hbs`<CookText @rawText="![an image](upload://a.png)" @class="post-body" />`
    );

    const html = query(".post-body").innerHTML.trim();
    assert.strictEqual(
      html,
      '<p><img src="/images/avatar.png" alt="an image"></p>'
    );
  });
});
