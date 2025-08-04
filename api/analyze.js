import * as cheerio from 'cheerio';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Fetch the webpage with proper headers
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    if (!response.ok) {
      return res.status(400).json({ 
        error: `Failed to fetch URL: ${response.status} ${response.statusText}` 
      });
    }

    const html = await response.text();
    
    // Parse HTML with Cheerio
    const $ = cheerio.load(html);
    
    // Extract headings
    const headings = [];
    $('h1, h2, h3, h4, h5, h6').each((index, element) => {
      const $el = $(element);
      const level = parseInt(element.tagName.charAt(1));
      const text = $el.text().trim();
      
      if (text) {
        headings.push({
          level,
          text: text.substring(0, 200)
        });
      }
    });

    // Analyze issues
    const issues = analyzeHeadingIssues(headings);
    
    // Generate suggestions
    const suggestions = generateSuggestions(headings);

    res.status(200).json({
      success: true,
      headings,
      issues,
      suggestions,
      url
    });

  } catch (error) {
    console.error('Error analyzing URL:', error);
    res.status(500).json({ 
      error: 'Failed to analyze webpage',
      details: error.message 
    });
  }
}

function analyzeHeadingIssues(headings) {
  const issues = [];
  
  if (headings.length === 0) {
    issues.push("No heading tags found on the page");
    return issues;
  }
  
  const h1Count = headings.filter(h => h.level === 1).length;
  if (h1Count === 0) {
    issues.push("No H1 tag found - every page should have exactly one H1");
  } else if (h1Count > 1) {
    issues.push(`Multiple H1 tags found (${h1Count}) - should have only one H1 per page`);
  }
  
  for (let i = 1; i < headings.length; i++) {
    const current = headings[i];
    const previous = headings[i - 1];
    
    if (current.level > previous.level + 1) {
      issues.push(`Skipped heading level: H${previous.level} followed by H${current.level} (should use H${previous.level + 1})`);
    }
  }
  
  if (headings.length > 0 && headings[0].level !== 1) {
    issues.push("Page should start with an H1 heading");
  }
  
  return issues;
}

function generateSuggestions(headings) {
  if (headings.length === 0) {
    return [
      {level: 1, text: "Add a main page title (H1)"},
      {level: 2, text: "Add section headings (H2)"},
      {level: 3, text: "Add subsection headings (H3) as needed"}
    ];
  }
  
  const suggestions = [];
  let currentMaxLevel = 1;
  
  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    
    if (i === 0) {
      suggestions.push({
        level: 1,
        text: heading.text
      });
      currentMaxLevel = 1;
    } else {
      const suggestedLevel = Math.min(heading.level, currentMaxLevel + 1);
      
      suggestions.push({
        level: suggestedLevel,
        text: heading.text
      });
      
      if (suggestedLevel > currentMaxLevel) {
        currentMaxLevel = suggestedLevel;
      }
    }
  }
  
  return suggestions;
}
