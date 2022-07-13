import { module, test } from "qunit";
import { setupRenderingTest } from "discourse/tests/helpers/component-test";
import { exists, query, queryAll } from "discourse/tests/helpers/qunit-helpers";
import { MiniReviewable } from "discourse/models/reviewable";
import { render } from "@ember/test-helpers";
import { hbs } from "ember-cli-htmlbars";
import I18n from "I18n";

function getReviewable(overrides = {}) {
  return MiniReviewable.create(
    Object.assign(
      {
        flagger_username: "sayo2",
        id: 17,
        pending: false,
        post_number: 3,
        topic_title: "anything hello world",
        type: "ReviewableFlaggedPost",
      },
      overrides
    )
  );
}

module(
  "Integration | Component | user-menu | default-reviewable-item",
  function (hooks) {
    setupRenderingTest(hooks);

    const template = hbs`<UserMenu::DefaultReviewableItem @item={{this.item}}/>`;

    test("doesn't push `reviewed` to the classList if the reviewable is pending", async function (assert) {
      this.set("item", getReviewable({ pending: true }));
      await render(template);
      assert.ok(!exists("li.reviewed"));
      assert.ok(exists("li"));
    });

    test("pushes `reviewed` to the classList if the reviewable isn't pending", async function (assert) {
      this.set("item", getReviewable({ pending: false }));
      await render(template);
      assert.ok(exists("li.reviewed"));
    });

    test("has 2 spans: one for label and one for description", async function (assert) {
      this.set("item", getReviewable());
      await render(template);
      const spans = queryAll("li span");
      assert.strictEqual(spans.length, 2);

      assert.strictEqual(
        spans[0].textContent.trim(),
        "sayo2",
        "the label contains flagger_username"
      );

      assert.strictEqual(
        spans[0].textContent.trim(),
        "sayo2",
        "the label is the flagger_username"
      );
      assert.strictEqual(
        spans[1].textContent.trim(),
        I18n.t("user_menu.reviewable.default_item", {
          reviewable_id: this.item.id,
        }),
        "the description is a generic I18n string"
      );
    });

    test("the item's label is an I18n string if flagger_username is absent", async function (assert) {
      this.set("item", getReviewable({ flagger_username: null }));
      await render(template);
      const label = query("li span");
      assert.strictEqual(
        label.textContent.trim(),
        I18n.t("user_menu.reviewable.deleted_user")
      );
    });
  }
);
