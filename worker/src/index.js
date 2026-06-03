/**
 * Cloudflare Worker: OG Meta Tag Rewriter for Compassion Profile Quiz
 *
 * Intercepts requests to quiz.sendrelief.org. When a ?result= parameter
 * is present, rewrites OG/Twitter meta tags so social platform crawlers
 * generate the correct card for each profile result.
 *
 * Normal browser visitors get the page as-is (JS handles the rest).
 */

const PROFILES = {
  responder: {
    title: "I'm a Responder — Practical, Attentive, Thoughtful",
    image: "https://quiz.sendrelief.org/result-responder.jpg",
  },
  protector: {
    title: "I'm a Protector — Brave, Loyal, Steadfast",
    image: "https://quiz.sendrelief.org/result-protector.jpg",
  },
  champion: {
    title: "I'm a Champion — Expressive, Attuned, Relational",
    image: "https://quiz.sendrelief.org/result-champion.jpg",
  },
  visionary: {
    title: "I'm a Visionary — Strategic, Persistent, Hopeful",
    image: "https://quiz.sendrelief.org/result-visionary.jpg",
  },
  mentor: {
    title: "I'm a Guide — Intentional, Discerning, Steady",
    image: "https://quiz.sendrelief.org/result-mentor.jpg",
  },
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const result = url.searchParams.get("result");
    const profile = result ? PROFILES[result.toLowerCase()] : null;

    // No result param or unknown profile — pass through to origin
    if (!profile) {
      return fetchOrigin(url, request);
    }

    const description =
      profile.title +
      ". Take the Compassion Profile Quiz to discover yours!";
    const pageUrl = url.toString();

    // Fetch the original page from GitHub Pages
    const response = await fetchOrigin(url, request);

    // Only rewrite HTML responses
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      return response;
    }

    // Use HTMLRewriter to swap meta tags in a single streaming pass
    return new HTMLRewriter()
      .on('meta[property="og:title"]', new MetaRewriter("content", profile.title))
      .on('meta[property="og:description"]', new MetaRewriter("content", description))
      .on('meta[property="og:image"]', new MetaRewriter("content", profile.image))
      .on('meta[property="og:url"]', new MetaRewriter("content", pageUrl))
      .on('meta[name="twitter:title"]', new MetaRewriter("content", profile.title))
      .on('meta[name="twitter:description"]', new MetaRewriter("content", description))
      .on('meta[name="twitter:image"]', new MetaRewriter("content", profile.image))
      .on("title", new TitleRewriter(profile.title + " | Send Relief"))
      .transform(response);
  },
};

class MetaRewriter {
  constructor(attr, value) {
    this.attr = attr;
    this.value = value;
  }
  element(el) {
    el.setAttribute(this.attr, this.value);
  }
}

class TitleRewriter {
  constructor(text) {
    this.text = text;
  }
  element(el) {
    el.setInnerContent(this.text);
  }
}

async function fetchOrigin(url, request) {
  // Build a request to the GitHub Pages origin
  // GitHub Pages redirects sub-paths to the CNAME domain, which loops back
  // to this worker. Use redirect: "manual" and retry with .html extension.
  let pathname = url.pathname;
  const fetchOpts = {
    method: request.method,
    redirect: "manual",
    headers: {
      "User-Agent": request.headers.get("User-Agent") || "Mozilla/5.0",
      "Accept": request.headers.get("Accept") || "text/html",
    },
  };

  const originBase = "https://nambnet.github.io/compassion-quiz";
  let response = await fetch(originBase + pathname, fetchOpts);

  // If GitHub Pages returns a redirect (CNAME), try with .html extension
  if (response.status >= 300 && response.status < 400 && pathname !== "/" && !pathname.includes(".")) {
    response = await fetch(originBase + pathname + ".html", fetchOpts);
  }

  // If still a redirect (e.g. CNAME redirect on the .html path), fetch the Location directly
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("Location");
    if (location) {
      // Rewrite CNAME redirects back to the origin to avoid loops
      const redirectUrl = new URL(location);
      if (redirectUrl.hostname === "quiz.sendrelief.org") {
        response = await fetch(originBase + redirectUrl.pathname, fetchOpts);
      }
    }
  }

  return response;
}
