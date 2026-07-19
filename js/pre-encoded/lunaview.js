const content = createWindow("lunaview", "Lunaview", {
  closable: true,
  minimizable: true,
  resizable: false,
  maximized: true,
});

const youtubeApiKey = "AIzaSyBeiJ1toodp7IgdBwkOa1wh8rU9hD0Waig";
const searchCache = getAppSearchCache("lunaview");

function cacheKey(query) {
  return query.trim().toLowerCase();
}

content.innerHTML = `
  <style>
    .lunaview {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      box-sizing: border-box;
    }
    .lunaviewSearch {
      display: flex;
      gap: 8px;
      margin-bottom: 0.75rem;
    }
    .lunaviewSearch input {
      flex: 1;
      margin: 0;
    }
    .lunaviewErrorText {
      color: #ff5f57;
      margin: 0 0 0.75rem;
    }
    .lunaviewBody {
      display: flex;
      flex: 1;
      min-height: 0;
      gap: 12px;
    }
    .lunaviewResults {
      flex: 1;
      min-width: 0;
      overflow-y: auto;
      padding-right: 4px;
    }
    .lunaviewPlayer {
      flex: 2;
      min-width: 0;
      min-height: 200px;
      display: flex;
    }
    .lunaviewPlayer iframe {
      width: 100%;
      height: 100%;
      min-height: 200px;
      border: none;
      border-radius: 12px;
      background: #000;
    }
    .lunaviewItem {
      display: flex;
      gap: 10px;
      padding: 8px;
      cursor: pointer;
      border-radius: 8px;
      margin-bottom: 4px;
      text-align: left;
      align-items: flex-start;
    }
    .lunaviewItem:hover {
      background: rgba(255, 255, 255, 0.08);
    }
    .lunaviewItem img {
      width: 120px;
      height: 68px;
      object-fit: cover;
      border-radius: 6px;
      flex-shrink: 0;
      background: #222;
    }
    .lunaviewItemTitle {
      font-size: 0.9rem;
      line-height: 1.3;
      color: #fff;
    }
    .lunaviewItemChannel {
      font-size: 0.75rem;
      color: #aaa;
      margin-top: 4px;
    }
    .lunaviewEmpty {
      color: #888;
      padding: 8px;
    }
    .lunaviewHidden {
      display: none;
    }
  </style>
  <div class="lunaview">
    <form class="lunaviewSearch" id="lunaviewForm">
      <input type="text" id="lunaviewQuery" placeholder="Search YouTube..." autocomplete="off" />
      <button type="submit" class="auto">Search</button>
    </form>
    <p id="lunaviewError" class="lunaviewErrorText lunaviewHidden"></p>
    <div class="lunaviewBody">
      <div id="lunaviewResults" class="lunaviewResults">
        <p class="lunaviewEmpty">Search for videos above.</p>
      </div>
      <div class="lunaviewPlayer">
        <iframe
          id="lunaviewIframe"
          title="YouTube video player"
          referrerpolicy="strict-origin-when-cross-origin"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen
        ></iframe>
      </div>
    </div>
  </div>
`;

const form = content.getElementById("lunaviewForm");
const queryInput = content.getElementById("lunaviewQuery");
const resultsEl = content.getElementById("lunaviewResults");
const errorEl = content.getElementById("lunaviewError");
const iframe = content.getElementById("lunaviewIframe");

function showError(message) {
  errorEl.textContent = message;
  errorEl.classList.remove("lunaviewHidden");
}

function clearError() {
  errorEl.textContent = "";
  errorEl.classList.add("lunaviewHidden");
}

function isQuotaError(data) {
  const err = data?.error;
  if (!err) return false;
  const reasons = (err.errors || []).map((e) => e.reason);
  return (
    err.code === 403 &&
    (reasons.includes("quotaExceeded") ||
      reasons.includes("dailyLimitExceeded") ||
      /quota/i.test(err.message || ""))
  );
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function canEmbedYouTube() {
  return (
    typeof pageOrigin === "string" &&
    pageOrigin &&
    pageOrigin !== "null" &&
    !pageOrigin.startsWith("file:")
  );
}

function buildEmbedUrl(videoId) {
  const safeId = String(videoId).replace(/[^a-zA-Z0-9_-]/g, "");
  let src =
    "https://www.youtube-nocookie.com/embed/" +
    safeId +
    "?autoplay=1&rel=0&modestbranding=1&playsinline=1";
  if (canEmbedYouTube()) {
    src += "&origin=" + encodeURIComponent(pageOrigin);
  }
  return src;
}

function playVideo(videoId) {
  if (!canEmbedYouTube()) {
    showError(
      "YouTube embeds need http://localhost — run npm run dev and open that URL (not a file:// path).",
    );
    return;
  }
  clearError();
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  iframe.src = buildEmbedUrl(videoId);
}

function renderResults(items) {
  if (!items.length) {
    resultsEl.innerHTML = '<p class="lunaviewEmpty">No videos found.</p>';
    return;
  }

  resultsEl.innerHTML = items
    .map((item) => {
      const id = item.id?.videoId;
      if (!id) return "";
      const thumb =
        item.snippet?.thumbnails?.medium?.url ||
        item.snippet?.thumbnails?.default?.url ||
        "";
      const title = escapeHtml(item.snippet?.title || "Untitled");
      const channel = escapeHtml(item.snippet?.channelTitle || "");
      return `
        <button type="button" class="lunaviewItem" data-video-id="${id}">
          <img src="${thumb}" alt="" />
          <div>
            <div class="lunaviewItemTitle">${title}</div>
            <div class="lunaviewItemChannel">${channel}</div>
          </div>
        </button>
      `;
    })
    .join("");

  resultsEl.querySelectorAll("[data-video-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      playVideo(btn.dataset.videoId);
    });
  });
}

async function searchYouTube(query) {
  const key = cacheKey(query);
  if (searchCache.has(key)) {
    clearError();
    renderResults(searchCache.get(key));
    return;
  }

  clearError();
  resultsEl.innerHTML = '<p class="lunaviewEmpty">Searching...</p>';

  const url =
    "https://www.googleapis.com/youtube/v3/search?part=snippet&q=" +
    encodeURIComponent(query) +
    "&type=video&maxResults=20&key=" +
    encodeURIComponent(youtubeApiKey);

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok || data.error) {
      if (isQuotaError(data)) {
        showError(
          "YouTube API daily limit reached. Try again tomorrow or check your Google Cloud quota.",
        );
        resultsEl.innerHTML = "";
        return;
      }
      const msg = data.error?.message || `Search failed (${res.status})`;
      showError(msg);
      resultsEl.innerHTML = "";
      return;
    }

    const items = data.items || [];
    searchCache.set(key, items);
    renderResults(items);
  } catch (err) {
    showError("Could not reach YouTube API. Check your network connection.");
    resultsEl.innerHTML = "";
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const query = queryInput.value.trim();
  if (!query) return;
  searchYouTube(query);
});
