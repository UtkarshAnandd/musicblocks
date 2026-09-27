/**
 * Contributor Issue Context design preview.
 *
 * The production feature is the /context issue comment posted by
 * .github/workflows/contributor-issue-context-command.yml. This page previews
 * the same content for maintainers, rendering the schema_version 1 report
 * written by .github/scripts/issue-context.py --format json. The bundled
 * example-report.json holds illustrative example data, not live GitHub data.
 * Every signal comes from the report; this page only formats it. It never
 * decides who may work on an issue.
 *
 * @copyright 2026 Sugar Labs
 *
 * @license
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 */

/* exported parseReport, formatDate, formatDataAsOf, safeGitHubUrl, parseLookup,
   renderIssueRow, createIssueContextPage */

const REPORT_URL = "./example-report.json";
const SCHEMA_VERSION = 1;
const THEME_KEY = "ic-theme";
const THEMES = ["system", "light", "dark"];
const DEFAULT_REPOSITORY = "sugarlabs/musicblocks";
const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):\d{2}Z$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SVG_NS = "http://www.w3.org/2000/svg";

const ICONS = {
    pr: '<circle cx="4" cy="3.5" r="1.5"/><circle cx="4" cy="12.5" r="1.5"/><circle cx="12" cy="12.5" r="1.5"/><path d="M4 5v6M12 11V6.5a2 2 0 0 0-2-2H7.5M9 3L7.5 4.5 9 6"/>',
    person: '<circle cx="8" cy="5.5" r="2.5"/><path d="M3 13.5c.8-2.4 2.7-3.5 5-3.5s4.2 1.1 5 3.5"/>',
    quote: '<path d="M3 6.5c0-1.7 1-3 2.5-3.5M3 6.5h2.5v3H3zM9 6.5c0-1.7 1-3 2.5-3.5M9 6.5h2.5v3H9z"/>',
    speech: '<path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"/>',
    warning: '<path d="M8 2.5l6 11H2z"/><path d="M8 6.5v3M8 11.5v.01"/>',
    chevron: '<path d="M6 4l4 4-4 4"/>',
    external: '<path d="M6 3h7v7M13 3L4 12"/>',
    system: '<rect x="2" y="3" width="12" height="8" rx="1.5"/><path d="M6 14h4M8 11v3"/>',
    light: '<circle cx="8" cy="8" r="2.75"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/>',
    dark: '<path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z"/>'
};
const STROKE = { chevron: "1.75", external: "1.75" };

const COPY = {
    noSignals: "No formally linked open PR · No human comments in the last 30 days",
    beforeStartOne:
        "An open PR is linked to this issue. Review the PR and discussion before starting. " +
        "Alternative implementations remain welcome.",
    beforeStartSeveral:
        "Several open PRs are linked to this issue. Review them and the discussion before " +
        "starting. Alternative implementations remain welcome.",
    beforeStartTextReference:
        "An open PR mentions this issue in its title or description. Review it and the " +
        "discussion before starting. Alternative implementations remain welcome.",
    beforeStartDiscussion:
        "Recent issue discussion was detected. Review the discussion before starting. " +
        "Alternative implementations remain welcome.",
    beforeStartUnavailable:
        "Linked PR data could not be read for this issue, so this report cannot say whether " +
        "linked PRs exist. Check the issue on GitHub before starting. Alternative " +
        "implementations remain welcome.",
    beforeStartNoSignals:
        "No related GitHub activity was detected by this report. This does not prove that " +
        "nobody else is working on the issue. Check the issue and repository activity before " +
        "starting. Alternative implementations remain welcome.",
    beforeStartGeneral:
        "Review the context below and the issue on GitHub before starting. Alternative " +
        "implementations remain welcome.",
    truncated: "GitHub returned only the first 20 linked PRs; more may exist.",
    unavailable:
        "GitHub did not return usable link data for this issue, so nothing can be said about " +
        "linked PRs here. Check the issue on GitHub before starting.",
    intentMarker: "May indicate contributor intent · review the discussion before starting",
    intentMarkerMobile: "May indicate contributor intent",
    assigneeNote: "GitHub metadata only; it does not restrict contribution.",
    contextChecked:
        "Linked PRs, PR text references, each issue's latest 5 comments, and contributor-intent " +
        "signals are checked. Signals are facts from GitHub, not a status, and some related " +
        "work may still be missing.",
    noComments: "No human comments in the last 30 days.",
    textScanIncomplete:
        "The open PR scan did not finish, so other PRs that mention this issue may exist.",
    textScanNotChecked: "Open PR titles and descriptions were not checked for this report.",
    commentCaption: "Preview of the comment posted on the issue after /context",
    informational:
        "This is informational only. It does not assign or reserve the issue. " +
        "Alternative implementations remain welcome.",
    refresh: "Comment /context on the issue to refresh this context.",
    errorEmphasis: 'Nothing on this page should be read as "no existing work".',
    errorReason: "The report data could not be read."
};

function isObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value) {
    return typeof value === "string" && value.trim() !== "";
}

function listOf(value) {
    return Array.isArray(value) ? value.filter(isObject) : [];
}

/** Validate report text. Returns { ok: true, report } or { ok: false }. */
function parseReport(text) {
    let value;
    try {
        value = JSON.parse(text);
    } catch (error) {
        return { ok: false };
    }
    if (!isObject(value) || value.schema_version !== SCHEMA_VERSION) {
        return { ok: false };
    }
    if (!Array.isArray(value.issues)) {
        return { ok: false };
    }
    const valid = value.issues.every(
        entry => isObject(entry) && isObject(entry.issue) && Number.isInteger(entry.issue.number)
    );
    return valid ? { ok: true, report: value } : { ok: false };
}

function isoParts(value) {
    const match = typeof value === "string" ? ISO_PATTERN.exec(value) : null;
    return match ? match.slice(1).map(Number) : null;
}

/** "MMM D, YYYY" in UTC, or null for a missing or malformed timestamp. */
function formatDate(value) {
    const parts = isoParts(value);
    if (!parts || parts[1] < 1 || parts[1] > 12) {
        return null;
    }
    return `${MONTHS[parts[1] - 1]} ${parts[2]}, ${parts[0]}`;
}

/** "YYYY-MM-DD HH:mm UTC" from the report's own timestamp, never the browser clock. */
function formatDataAsOf(value) {
    return isoParts(value) ? `${value.slice(0, 10)} ${value.slice(11, 16)} UTC` : null;
}

function safeGitHubUrl(value) {
    if (typeof value !== "string") {
        return null;
    }
    try {
        const url = new URL(value);
        return url.protocol === "https:" && url.hostname === "github.com" ? url.href : null;
    } catch (error) {
        return null;
    }
}

/** Issue number from the lookup box, or null. Trims and strips one leading "#". */
function parseLookup(value) {
    let text = String(value).trim();
    if (text.startsWith("#")) {
        text = text.slice(1);
    }
    return /^\d+$/.test(text) ? Number(text) : null;
}

function plural(count, one, many) {
    return count === 1 ? one : many;
}

function h(doc, tag, options = {}, children = []) {
    const node = doc.createElement(tag);
    if (options.className) {
        node.className = options.className;
    }
    if (options.text !== undefined) {
        node.textContent = options.text;
    }
    for (const [name, value] of Object.entries(options.attrs || {})) {
        node.setAttribute(name, value);
    }
    for (const child of children) {
        if (child) {
            node.appendChild(typeof child === "string" ? doc.createTextNode(child) : child);
        }
    }
    return node;
}

function icon(doc, name) {
    const svg = doc.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", `icon icon-${name}`);
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", STROKE[name] || "1.5");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    for (const shape of ICONS[name].match(/<[^>]+\/>/g)) {
        const [, tag, attrs] = /^<(\w+)\s+([^/]*)\/>$/.exec(shape);
        const element = doc.createElementNS(SVG_NS, tag);
        for (const [, key, value] of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) {
            element.setAttribute(key, value);
        }
        svg.appendChild(element);
    }
    return svg;
}

function timeNode(doc, value, text) {
    return h(doc, "time", { text, attrs: { datetime: value } });
}

function repoIssueUrl(repository, number) {
    return safeGitHubUrl(`https://github.com/${repository}/issues/${number}`);
}

function prCard(doc, pr, kind) {
    const number = Number.isInteger(pr.number) ? pr.number : "?";
    const title = `#${number} ${isText(pr.title) ? pr.title : "Untitled pull request"}`;
    const href = safeGitHubUrl(pr.url);
    const state = kind === "previous" ? "Closed" : pr.is_draft === true ? "Draft" : "Open";
    const updated = formatDate(pr.updated_at);
    const meta = h(doc, "p", { className: "pr-meta" }, [
        `${state} · by @${isText(pr.author) ? pr.author : "Unknown"}`,
        updated ? " · updated " : null,
        updated ? timeNode(doc, pr.updated_at, updated) : null
    ]);
    return h(doc, "li", { className: "card pr-card" }, [
        icon(doc, "pr"),
        h(doc, "div", { className: "pr-text" }, [
            href
                ? h(doc, "a", { className: "pr-title", text: title, attrs: { href } })
                : h(doc, "span", { className: "pr-title", text: title }),
            meta
        ])
    ]);
}

function sectionHeading(doc, text, suffix) {
    return h(doc, "h3", {}, [
        text,
        suffix ? h(doc, "span", { className: "heading-suffix", text: suffix }) : null
    ]);
}

function limitationMessage(entry, code) {
    const match = listOf(entry.limitations).find(item => item.code === code);
    return match && isText(match.message) ? match.message : null;
}

function renderPrSection(doc, entry, coverage) {
    const number = entry.issue.number;
    const prs = listOf(entry.formal_open_prs);
    const body = [];
    if (coverage.formal_links === "unavailable") {
        body.push(h(doc, "p", { className: "panel-text", text: COPY.unavailable }));
    } else if (prs.length) {
        body.push(
            h(
                doc,
                "ul",
                { className: "card-list" },
                prs.map(pr => prCard(doc, pr, "open"))
            )
        );
    } else {
        body.push(
            h(doc, "p", { className: "panel-text", text: "No formally linked open PR found." })
        );
        body.push(
            h(doc, "p", {
                className: "panel-note",
                text:
                    `PRs that only mention this issue in text, such as "Related to #${number}", ` +
                    "are listed separately below when found. Check the issue timeline on GitHub " +
                    "before starting."
            })
        );
    }
    if (coverage.formal_links === "truncated") {
        body.push(h(doc, "p", { className: "panel-note", text: COPY.truncated }));
    }
    return h(doc, "section", { className: "panel-section pr-section" }, [
        sectionHeading(doc, "Linked open pull requests", "formal GitHub links only"),
        ...body
    ]);
}

function renderTextReferenceSection(doc, entry, coverage) {
    const prs = listOf(entry.text_reference_prs);
    const status = coverage.text_references;
    const complete = status === "complete";
    if (!prs.length && complete) {
        return null;
    }
    const body = [];
    if (status === "not_checked") {
        body.push(h(doc, "p", { className: "panel-note", text: COPY.textScanNotChecked }));
    } else {
        if (prs.length) {
            body.push(
                h(
                    doc,
                    "ul",
                    { className: "card-list" },
                    prs.map(pr => prCard(doc, pr, "open"))
                )
            );
        }
        const capped = limitationMessage(entry, "text_references_capped");
        if (capped) {
            body.push(h(doc, "p", { className: "panel-note", text: capped }));
        }
        if (!complete) {
            body.push(h(doc, "p", { className: "panel-note", text: COPY.textScanIncomplete }));
        }
    }
    return h(doc, "section", { className: "panel-section text-reference-section" }, [
        sectionHeading(
            doc,
            "Pull requests that mention this issue",
            "title or description text, not a formal link"
        ),
        ...body
    ]);
}

function renderPreviousSection(doc, entry, coverage) {
    const prs = listOf(entry.previous_closed_unmerged_prs);
    const unknown = Number.isInteger(coverage.merge_state_unknown_count)
        ? coverage.merge_state_unknown_count
        : 0;
    if (!prs.length && unknown < 1) {
        return null;
    }
    const body = [];
    if (prs.length) {
        body.push(
            h(
                doc,
                "ul",
                { className: "card-list" },
                prs.map(pr => prCard(doc, pr, "previous"))
            )
        );
    }
    if (unknown > 0) {
        body.push(
            h(doc, "p", {
                className: "panel-note",
                text: plural(
                    unknown,
                    "1 closed linked PR had missing merge information and is not listed.",
                    `${unknown} closed linked PRs had missing merge information and are not listed.`
                )
            })
        );
    }
    return h(doc, "section", { className: "panel-section previous-section" }, [
        sectionHeading(doc, "Previous linked pull requests", "closed, not merged"),
        ...body
    ]);
}

function renderLimitations(doc, entry) {
    const messages = listOf(entry.limitations)
        .map(item => item.message)
        .filter(isText);
    if (!messages.length) {
        return null;
    }
    return h(doc, "section", { className: "panel-section limitations-section" }, [
        sectionHeading(doc, "Detection limitations", "what this report cannot see"),
        h(
            doc,
            "ul",
            { className: "limitation-list" },
            messages.map(message => h(doc, "li", { text: message }))
        )
    ]);
}

function renderComments(doc, entry) {
    const comments = listOf(entry.recent_human_discussion);
    const intentUrls = new Set(
        listOf(entry.contributor_intent)
            .map(item => item.url)
            .filter(isText)
    );
    const body = [];
    if (!comments.length) {
        body.push(h(doc, "p", { className: "panel-note", text: COPY.noComments }));
    } else {
        body.push(
            h(
                doc,
                "ul",
                { className: "card-list" },
                comments.map(comment => {
                    const date = formatDate(comment.created_at);
                    const href = safeGitHubUrl(comment.url);
                    return h(doc, "li", { className: "card comment-card" }, [
                        h(doc, "div", { className: "comment-meta" }, [
                            h(doc, "span", {
                                className: "comment-author",
                                text: `@${isText(comment.author) ? comment.author : "Unknown"}`
                            }),
                            date
                                ? h(doc, "span", { className: "comment-date" }, [
                                      timeNode(doc, comment.created_at, date)
                                  ])
                                : null,
                            href
                                ? h(doc, "a", {
                                      className: "comment-link",
                                      text: "View comment",
                                      attrs: { href }
                                  })
                                : null
                        ]),
                        h(doc, "p", {
                            className: "comment-excerpt",
                            text: typeof comment.excerpt === "string" ? comment.excerpt : ""
                        }),
                        intentUrls.has(comment.url)
                            ? h(doc, "p", { className: "intent-marker" }, [
                                  icon(doc, "quote"),
                                  h(doc, "span", { className: "d-only", text: COPY.intentMarker }),
                                  h(doc, "span", {
                                      className: "m-only",
                                      text: COPY.intentMarkerMobile
                                  })
                              ])
                            : null
                    ]);
                })
            )
        );
    }
    return h(doc, "section", { className: "panel-section comments-section" }, [
        sectionHeading(doc, "Recent discussion", "Last 30 days · up to 5 comments"),
        ...body
    ]);
}

function renderDetails(doc, entry) {
    const issue = entry.issue;
    const assignees = listOf(entry.assignees)
        .map(item => item.login)
        .filter(isText);
    const pair = (term, values, className = "detail-pair") =>
        h(doc, "div", { className }, [h(doc, "dt", { text: term }), ...values]);
    const items = [
        pair("Opened by", [
            h(doc, "dd", { text: isText(issue.author) ? `@${issue.author}` : "Unknown" })
        ]),
        pair("Milestone", [
            h(doc, "dd", { text: isText(issue.milestone) ? issue.milestone : "None" })
        ]),
        pair("Assignees", [
            h(doc, "dd", {
                text: assignees.length ? assignees.map(login => `@${login}`).join(", ") : "None"
            }),
            assignees.length
                ? h(doc, "dd", { className: "assignee-note", text: COPY.assigneeNote })
                : null
        ])
    ];
    if (Number.isInteger(issue.participant_count)) {
        items.push(
            pair(
                "Participants",
                [h(doc, "dd", { text: String(issue.participant_count) })],
                "detail-pair detail-participants"
            )
        );
    }
    const href = safeGitHubUrl(issue.url);
    return h(doc, "aside", { className: "details" }, [
        h(doc, "h3", { text: "Details" }),
        h(doc, "dl", {}, items),
        href
            ? h(doc, "a", { className: "button-link open-issue-button", attrs: { href } }, [
                  `Open issue #${issue.number} on GitHub`,
                  icon(doc, "external")
              ])
            : null
    ]);
}

/**
 * Pick the "Before you start" guidance from the generator's fields. "No activity"
 * is only said when every check completed and found nothing.
 */
function beforeStartText(entry, coverage) {
    const count = key => listOf(entry[key]).length;
    const formal = count("formal_open_prs");
    if (coverage.formal_links === "unavailable") {
        return COPY.beforeStartUnavailable;
    }
    if (formal) {
        return formal === 1 ? COPY.beforeStartOne : COPY.beforeStartSeveral;
    }
    if (count("text_reference_prs")) {
        return COPY.beforeStartTextReference;
    }
    if (count("recent_human_discussion") || count("contributor_intent")) {
        return COPY.beforeStartDiscussion;
    }
    const complete =
        coverage.formal_links === "complete" && coverage.text_references === "complete";
    const quiet =
        !count("previous_closed_unmerged_prs") &&
        !count("assignees") &&
        !(coverage.merge_state_unknown_count > 0);
    return complete && quiet ? COPY.beforeStartNoSignals : COPY.beforeStartGeneral;
}

function renderBeforeStart(doc, entry, coverage) {
    return h(doc, "section", { className: "card before-start" }, [
        h(doc, "h3", { text: "Before you start" }),
        h(doc, "p", { text: beforeStartText(entry, coverage) })
    ]);
}

function renderCommentHeader(doc, entry) {
    const dataAsOf = formatDataAsOf(entry.data_as_of);
    return h(doc, "header", { className: "comment-header" }, [
        h(doc, "h3", { text: "Issue Context" }),
        h(doc, "p", { className: "comment-caption" }, [
            COPY.commentCaption,
            dataAsOf ? " · Data as of " : null,
            dataAsOf ? timeNode(doc, entry.data_as_of, dataAsOf) : null
        ])
    ]);
}

function renderCommentFooter(doc) {
    return h(doc, "footer", { className: "comment-footer" }, [
        h(doc, "p", { className: "informational", text: COPY.informational }),
        h(doc, "p", { text: COPY.refresh })
    ]);
}

function renderContextPanel(doc, entry) {
    const coverage = isObject(entry.coverage) ? entry.coverage : {};
    return h(
        doc,
        "div",
        { className: "context-panel", attrs: { id: `ctx-${entry.issue.number}` } },
        [
            renderCommentHeader(doc, entry),
            h(doc, "div", { className: "main-column" }, [
                renderBeforeStart(doc, entry, coverage),
                renderPrSection(doc, entry, coverage),
                renderTextReferenceSection(doc, entry, coverage),
                renderComments(doc, entry),
                renderPreviousSection(doc, entry, coverage),
                renderLimitations(doc, entry)
            ]),
            renderDetails(doc, entry),
            renderCommentFooter(doc)
        ]
    );
}

function chip(doc, iconName, desktopText, mobileText, className = "chip") {
    return h(doc, "span", { className }, [
        icon(doc, iconName),
        mobileText
            ? h(doc, "span", { className: "d-only", text: desktopText })
            : h(doc, "span", { text: desktopText }),
        mobileText ? h(doc, "span", { className: "m-only", text: mobileText }) : null
    ]);
}

function renderSignals(doc, entry) {
    const coverage = isObject(entry.coverage) ? entry.coverage : {};
    const prs = listOf(entry.formal_open_prs).length;
    const assignees = listOf(entry.assignees).length;
    const intent = listOf(entry.contributor_intent).length;
    const recent = listOf(entry.recent_human_discussion).length;
    const unavailable = coverage.formal_links === "unavailable";
    const chips = [];
    if (unavailable) {
        chips.push(chip(doc, "warning", "Linked PR data unavailable", null, "chip chip-warn"));
    } else if (prs) {
        chips.push(
            chip(doc, "pr", prs === 1 ? "1 linked open PR" : `${prs} linked open PRs`, null)
        );
    }
    if (assignees) {
        chips.push(chip(doc, "person", "Assignee recorded", null));
    }
    if (intent) {
        chips.push(chip(doc, "quote", "Possible contributor intent", null));
    }
    if (recent) {
        chips.push(
            chip(
                doc,
                "speech",
                `Recent discussion · ${recent} ${plural(recent, "comment", "comments")}`,
                `Recent discussion · ${recent}`
            )
        );
    }
    const line = h(doc, "div", { className: "signal-line" }, chips);
    if (!chips.length) {
        line.appendChild(h(doc, "p", { className: "no-signals", text: COPY.noSignals }));
    }
    return line;
}

/** One collapsed issue row. */
function renderIssueRow(doc, entry, repository) {
    const issue = entry.issue;
    const number = issue.number;
    const title = isText(issue.title) ? issue.title : "Untitled issue";
    const labels = Array.isArray(issue.labels) ? issue.labels.filter(isText) : [];
    const milestone = isText(issue.milestone) ? issue.milestone : null;
    const updated = formatDate(issue.updated_at);
    const issueUrl = safeGitHubUrl(issue.url);

    const disclosure = h(
        doc,
        "button",
        {
            className: "disclosure",
            attrs: { "type": "button", "aria-expanded": "false", "aria-controls": `ctx-${number}` }
        },
        [
            icon(doc, "chevron"),
            h(doc, "span", {}, [
                h(doc, "span", { className: "row-number", text: `#${number}` }),
                " ",
                h(doc, "span", { className: "row-title", text: title })
            ])
        ]
    );
    const rowMeta = h(doc, "div", { className: "row-meta" }, [
        updated ? h(doc, "span", {}, ["Updated ", timeNode(doc, issue.updated_at, updated)]) : null,
        issueUrl
            ? h(
                  doc,
                  "a",
                  {
                      className: "button-link row-github",
                      attrs: { "href": issueUrl, "aria-label": `Open issue #${number} on GitHub` }
                  },
                  ["GitHub", icon(doc, "external")]
              )
            : null
    ]);
    const labelLine =
        labels.length || milestone
            ? h(doc, "div", { className: "label-line" }, [
                  ...labels.map(name =>
                      h(doc, "span", { className: "label-pill" }, [
                          h(doc, "span", {
                              className: "label-dot",
                              attrs: { "aria-hidden": "true" }
                          }),
                          h(doc, "span", { text: name })
                      ])
                  ),
                  milestone
                      ? h(doc, "span", { className: "milestone", text: `Milestone: ${milestone}` })
                      : null
              ])
            : null;
    const mobileParts = [...labels];
    if (milestone) {
        mobileParts.push(milestone);
    }
    const mobileMeta = h(doc, "p", { className: "mobile-meta m-only" }, [
        mobileParts.join(" · "),
        updated ? `${mobileParts.length ? " · " : ""}Updated ` : null,
        updated ? timeNode(doc, issue.updated_at, updated) : null
    ]);
    return h(doc, "li", { className: "issue-row", attrs: { id: `issue-${number}` } }, [
        h(doc, "div", { className: "row-header" }, [disclosure, rowMeta]),
        renderSignals(doc, entry),
        labelLine,
        mobileMeta
    ]);
}

function skeleton(doc) {
    const widths = [
        [62, 34],
        [48, 40],
        [70, 26],
        [55, 32]
    ];
    return h(
        doc,
        "ul",
        { className: "issue-list skeleton-list", attrs: { "aria-hidden": "true" } },
        widths.map(([title, meta]) =>
            h(doc, "li", { className: "skeleton-row" }, [
                h(doc, "span", {
                    className: "skeleton-bar skeleton-bar-title",
                    attrs: { style: `width: ${title}%` }
                }),
                h(doc, "span", {
                    className: "skeleton-bar skeleton-bar-meta",
                    attrs: { style: `width: ${meta}%` }
                })
            ])
        )
    );
}

/**
 * Wire the page. `env` supplies fetch, storage, matchMedia, and location so
 * the page can be tested without a browser.
 */
function createIssueContextPage(doc, env) {
    const region = doc.getElementById("report-region");
    const notFoundSlot = doc.getElementById("not-found-slot");
    const form = doc.getElementById("issue-selector");
    const input = doc.getElementById("issue-lookup");
    const switcher = doc.querySelector(".theme-switcher");
    const state = { report: null, repository: DEFAULT_REPOSITORY, entries: new Map() };

    const media = env.matchMedia ? env.matchMedia("(prefers-color-scheme: dark)") : null;

    const readTheme = () => {
        try {
            const stored = env.storage ? env.storage.getItem(THEME_KEY) : null;
            return THEMES.includes(stored) ? stored : "system";
        } catch (error) {
            return "system";
        }
    };

    const applyTheme = preference => {
        const dark = preference === "dark" || (preference === "system" && media && media.matches);
        doc.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
        for (const segment of switcher.querySelectorAll(".theme-segment")) {
            segment.setAttribute("aria-pressed", String(segment.dataset.theme === preference));
        }
    };

    let preference = readTheme();
    for (const theme of THEMES) {
        const name = theme.charAt(0).toUpperCase() + theme.slice(1);
        const segment = h(
            doc,
            "button",
            {
                className: "theme-segment",
                attrs: {
                    "type": "button",
                    "data-theme": theme,
                    "aria-pressed": "false",
                    "aria-label": `${name} theme`,
                    "title": `${name} theme`
                }
            },
            [icon(doc, theme), h(doc, "span", { className: "theme-segment-label", text: name })]
        );
        segment.addEventListener("click", () => {
            preference = theme;
            applyTheme(preference);
            try {
                if (env.storage) {
                    env.storage.setItem(THEME_KEY, theme);
                }
            } catch (error) {
                // The choice still applies for this visit.
            }
        });
        switcher.appendChild(segment);
    }
    applyTheme(preference);
    if (media && media.addEventListener) {
        media.addEventListener("change", () => {
            if (preference === "system") {
                applyTheme(preference);
            }
        });
    }

    const setExpanded = (row, expanded) => {
        const number = Number(row.id.slice("issue-".length));
        const button = row.querySelector(".disclosure");
        const existing = row.querySelector(".context-panel");
        button.setAttribute("aria-expanded", String(expanded));
        if (expanded && !existing) {
            row.appendChild(renderContextPanel(doc, state.entries.get(number)));
        } else if (!expanded && existing) {
            existing.remove();
        }
    };

    const clearNotFound = () => notFoundSlot.replaceChildren();

    const showNotFound = number => {
        const href = repoIssueUrl(state.repository, number);
        notFoundSlot.replaceChildren(
            h(doc, "section", { className: "state-panel not-found", attrs: { role: "status" } }, [
                h(doc, "h2", { text: `Issue #${number} is not in this example report` }),
                h(doc, "p", {
                    className: "state-text",
                    text:
                        "This preview only contains illustrative example issues. To see real " +
                        `context for #${number}, open it on GitHub and comment /context.`
                }),
                href
                    ? h(doc, "a", {
                          className: "state-link",
                          text: `Open #${number} on GitHub`,
                          attrs: { href }
                      })
                    : null
            ])
        );
    };

    const issueView = () => doc.getElementById("issue-view");

    /** Show exactly one issue, expanded. There is no list of issues to browse. */
    const focusIssue = (number, updateHash) => {
        const view = issueView();
        if (!view || !state.entries.has(number)) {
            return false;
        }
        const row = renderIssueRow(doc, state.entries.get(number), state.repository);
        const list = h(doc, "ul", { className: "issue-list" }, [row]);
        list.addEventListener("click", event => {
            const button = event.target.closest(".disclosure");
            if (button) {
                setExpanded(row, button.getAttribute("aria-expanded") !== "true");
            }
        });
        view.replaceChildren(list);
        setExpanded(row, true);
        if (row.scrollIntoView) {
            row.scrollIntoView({ block: "start" });
        }
        row.querySelector(".disclosure").focus();
        if (updateHash && env.history) {
            env.history.replaceState(null, "", `#issue-${number}`);
        }
        return true;
    };

    const renderScope = report => {
        const dataAsOf = formatDataAsOf(report.data_as_of);
        const timeFor = () => timeNode(doc, report.data_as_of, dataAsOf);
        return h(
            doc,
            "section",
            { className: "scope-strip", attrs: { "aria-labelledby": "context-checked-title" } },
            [
                h(doc, "p", { className: "scope-line" }, [
                    h(doc, "strong", {
                        className: "scope-title",
                        text: "Context checked",
                        attrs: { id: "context-checked-title" }
                    }),
                    dataAsOf
                        ? h(doc, "span", {}, [
                              "Example data as of ",
                              timeFor(),
                              " · illustrative, not live GitHub data"
                          ])
                        : h(doc, "span", { text: "Illustrative, not live GitHub data" })
                ]),
                h(doc, "p", { text: COPY.contextChecked })
            ]
        );
    };

    const renderReport = report => {
        state.report = report;
        state.repository = isText(report.repository) ? report.repository : DEFAULT_REPOSITORY;
        const entries = [...report.issues].sort((a, b) => a.issue.number - b.issue.number);
        state.entries = new Map(entries.map(entry => [entry.issue.number, entry]));
        const prompt = entries.length
            ? "Choose an example issue to preview its Issue Context comment."
            : "No open issues matched this report.";
        const choices = entries.length
            ? h(
                  doc,
                  "ul",
                  { className: "example-choices" },
                  entries.map(entry => {
                      const number = entry.issue.number;
                      const title = isText(entry.issue.title)
                          ? entry.issue.title
                          : "Untitled issue";
                      const button = h(doc, "button", {
                          className: "example-choice",
                          text: `#${number} ${title}`,
                          attrs: { type: "button" }
                      });
                      button.addEventListener("click", () => {
                          clearNotFound();
                          focusIssue(number, true);
                      });
                      return h(doc, "li", {}, [button]);
                  })
              )
            : null;
        region.replaceChildren(
            h(doc, "div", { attrs: { id: "issue-view" } }, [
                h(doc, "div", { className: "issue-list" }, [
                    h(doc, "p", { className: "empty-report", text: prompt }),
                    choices
                ])
            ]),
            renderScope(report)
        );
    };

    const renderError = () => {
        state.report = null;
        state.entries = new Map();
        const tryAgain = h(doc, "button", {
            className: "button",
            text: "Try again",
            attrs: { type: "button" }
        });
        tryAgain.addEventListener("click", () => load());
        const browse = safeGitHubUrl(`https://github.com/${state.repository}/issues`);
        region.replaceChildren(
            h(doc, "section", { className: "error-alert", attrs: { role: "alert" } }, [
                h(doc, "h2", {}, [icon(doc, "warning"), "Issue context could not be loaded"]),
                h(doc, "p", { text: COPY.errorReason }),
                h(doc, "p", { className: "error-emphasis", text: COPY.errorEmphasis }),
                h(doc, "div", { className: "error-controls" }, [
                    tryAgain,
                    browse
                        ? h(doc, "a", {
                              className: "button-link",
                              text: "Browse open issues on GitHub",
                              attrs: { href: browse }
                          })
                        : null
                ])
            ])
        );
        tryAgain.focus();
    };

    const renderLoading = () => {
        state.report = null;
        region.replaceChildren(
            h(doc, "p", {
                className: "status-strip",
                text: "Loading example report…",
                attrs: { "role": "status", "aria-live": "polite" }
            }),
            skeleton(doc)
        );
    };

    const load = async () => {
        clearNotFound();
        renderLoading();
        let result = { ok: false };
        try {
            const response = await env.fetch(REPORT_URL, { cache: "no-store" });
            if (response.ok) {
                result = parseReport(await response.text());
            }
        } catch (error) {
            result = { ok: false };
        }
        if (!result.ok) {
            renderError();
            return;
        }
        renderReport(result.report);
        const hash = /^#issue-(\d+)$/.exec(env.location ? env.location.hash : "");
        if (hash) {
            focusIssue(Number(hash[1]), false);
        }
    };

    form.addEventListener("submit", event => {
        event.preventDefault();
        const number = parseLookup(input.value);
        if (number === null || !state.report) {
            input.focus();
            return;
        }
        if (state.entries.has(number)) {
            clearNotFound();
            focusIssue(number, true);
        } else {
            showNotFound(number);
        }
    });
    input.addEventListener("input", clearNotFound);

    return { load, applyTheme };
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        parseReport,
        formatDate,
        formatDataAsOf,
        safeGitHubUrl,
        parseLookup,
        renderIssueRow,
        createIssueContextPage,
        COPY,
        REPORT_URL
    };
} else if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", () => {
        let storage = null;
        try {
            storage = window.localStorage;
        } catch (error) {
            storage = null;
        }
        createIssueContextPage(document, {
            fetch: window.fetch.bind(window),
            storage,
            matchMedia: window.matchMedia ? window.matchMedia.bind(window) : null,
            location: window.location,
            history: window.history
        }).load();
    });
}
