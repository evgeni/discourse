import GlimmerComponent from "discourse/components/glimmer";
import { bind } from "discourse-common/utils/decorators";

const SCROLLER_HEIGHT = 50;
const LAST_READ_HEIGHT = 20;
const MIN_SCROLLAREA_HEIGHT = 170;
const MAX_SCROLLAREA_HEIGHT = 300;

export default class TopicTimelineScrollarea extends GlimmerComponent {
  buildKey = `timeline-scrollarea-${this.args.topic.id}`;
  style = `height: ${this.scrollareaHeight()}px`;
  percentage = this._percentFor(this.args.topic, this.args.enteredIndex + 1);
  scrolledPost = 1;

  position() {
    const { attrs } = this;
    const percentage = this.state.percentage;
    const topic = attrs.topic;
    const postStream = topic.get("postStream");
    const total = postStream.get("filteredPostsCount");

    const scrollPosition =
      this.clamp(Math.floor(total * percentage), 0, total) + 1;
    const current = this.clamp(scrollPosition, 1, total);

    const daysAgo = postStream.closestDaysAgoFor(current);
    let date;

    if (daysAgo === undefined) {
      const post = postStream
        .get("posts")
        .findBy("id", postStream.get("stream")[current]);

      if (post) {
        date = new Date(post.get("created_at"));
      }
    } else if (daysAgo !== null) {
      date = new Date();
      date.setDate(date.getDate() - daysAgo || 0);
    } else {
      date = null;
    }

    const result = {
      current,
      scrollPosition,
      total,
      date,
      lastRead: null,
      lastReadPercentage: null,
    };

    const lastReadId = topic.last_read_post_id;
    const lastReadNumber = topic.last_read_post_number;

    if (lastReadId && lastReadNumber) {
      const idx = postStream.get("stream").indexOf(lastReadId) + 1;
      result.lastRead = idx;
      result.lastReadPercentage = this._percentFor(topic, idx);
    }

    if (this.state.position !== result.scrollPosition) {
      this.state.position = result.scrollPosition;
      this.sendWidgetAction("updatePosition", current);
    }

    return result;
  }

  html(attrs, state) {
    const position = this.position();

    state.scrolledPost = position.current;
    const percentage = state.percentage;
    if (percentage === null) {
      return;
    }

    const before = this.scrollareaRemaining() * percentage;
    const after = this.scrollareaHeight() - before - SCROLLER_HEIGHT;

    let showButton = false;
    const hasBackPosition =
      position.lastRead &&
      position.lastRead > 3 &&
      position.lastRead > position.current &&
      Math.abs(position.lastRead - position.current) > 3 &&
      Math.abs(position.lastRead - position.total) > 1 &&
      position.lastRead !== position.total;

    if (hasBackPosition) {
      const lastReadTop = Math.round(
        position.lastReadPercentage * this.scrollareaHeight()
      );
      showButton =
        before + SCROLLER_HEIGHT - 5 < lastReadTop || before > lastReadTop + 25;
    }

    let scrollerAttrs = position;
    scrollerAttrs.showDockedButton =
      !attrs.mobileView && hasBackPosition && !showButton;
    scrollerAttrs.fullScreen = attrs.fullScreen;
    scrollerAttrs.topicId = attrs.topic.id;

    const result = [
      this.attach("timeline-padding", { height: before }),
      this.attach("timeline-scroller", scrollerAttrs),
      this.attach("timeline-padding", { height: after }),
    ];

    if (hasBackPosition) {
      const lastReadTop = Math.round(
        position.lastReadPercentage * this.scrollareaHeight()
      );
      result.push(
        this.attach("timeline-last-read", {
          top: lastReadTop,
          lastRead: position.lastRead,
          showButton,
        })
      );
    }

    return result;
  }

  updatePercentage(y) {
    const $area = $(".timeline-scrollarea");
    const areaTop = $area.offset().top;

    const percentage = this.clamp(parseFloat(y - areaTop) / $area.height());

    this.state.percentage = percentage;
  }

  commit() {
    const position = this.position();
    this.state.scrolledPost = position.current;

    if (position.current === position.scrollPosition) {
      this.sendWidgetAction("jumpToIndex", position.current);
    } else {
      this.sendWidgetAction("jumpEnd");
    }
  }

  topicCurrentPostScrolled(event) {
    this.state.percentage = event.percent;
  }

  _percentFor(topic, postIndex) {
    const total = topic.get("postStream.filteredPostsCount");
    return this.clamp(parseFloat(postIndex - 1.0) / total);
  }

  goBack() {
    this.sendWidgetAction("jumpToIndex", this.position().lastRead);
  }

  clamp(p, min = 0.0, max = 1.0) {
    return Math.max(Math.min(p, max), min);
  }

  scrollareaRemaining() {
    return this.scrollareaHeight() - SCROLLER_HEIGHT;
  }

  scrollareaHeight() {
    const composerHeight =
        document.getElementById("reply-control").offsetHeight || 0,
      headerHeight =
        document.querySelectorAll(".d-header")[0].offsetHeight || 0;

    // scrollarea takes up about half of the timeline's height
    const availableHeight =
      (window.innerHeight - composerHeight - headerHeight) / 2;

    return Math.max(
      MIN_SCROLLAREA_HEIGHT,
      Math.min(availableHeight, MAX_SCROLLAREA_HEIGHT)
    );
  }
}
