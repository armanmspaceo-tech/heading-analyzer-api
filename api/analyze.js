// api/analyze.js - Complete working version
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

    console.log('Analyzing URL:', url);

    // Fetch the webpage
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    if (!response.ok) {
      return res.status(400).json({ 
        error: `Failed to fetch URL: ${response.status} ${response.statusText}` 
      });
    }

    const html = await response.text();
    console.log('HTML fetched, length:', html.length);
    
    // Parse HTML with Cheerio
    const $ = cheerio.load(html);
    
    // Extract headings
    const headings = [];
    $('h1, h2, h3, h4, h5, h6').each((index, element) => {
      const $el = $(element);
      const level = parseInt(element.tagName.charAt(1));
      const text = $el.text().trim();
      
      if (text && text.length > 0) {
        headings.push({
          level,
          text: text.substring(0, 150) // Limit text length
        });
      }
    });

    console.log('Headings extracted:', headings.length);

    // Analyze issues
    const issues = analyzeHeadingIssues(headings);
    
    // Generate improved suggestions
    const suggestions = generateImprovedSuggestions(headings);

    console.log('Analysis complete');

    res.status(200).json({
      success: true,
      headings,
      issues,
      suggestions,
      url,
      timestamp: new Date().toISOString()
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
  
  // Check for H1 issues
  const h1Count = headings.filter(h => h.level === 1).length;
  if (h1Count === 0) {
    issues.push("❌ No H1 tag found - every page should have exactly one H1");
  } else if (h1Count > 1) {
    issues.push(`❌ Multiple H1 tags found (${h1Count}) - should have only one H1 per page`);
  }
  
  // Check for skipped heading levels
  for (let i = 1; i < headings.length; i++) {
    const current = headings[i];
    const previous = headings[i - 1];
    
    if (current.level > previous.level + 1) {
      issues.push(`⚠️ Skipped heading level: H${previous.level} followed by H${current.level} (should use H${previous.level + 1})`);
    }
  }
  
  // Check heading order
  if (headings.length > 0 && headings[0].level !== 1) {
    issues.push("⚠️ Page should start with an H1 heading");
  }
  
  // Check for content organization issues
  const h2Count = headings.filter(h => h.level === 2).length;
  const h3Count = headings.filter(h => h.level === 3).length;
  
  if (h3Count > 0 && h2Count < 2) {
    issues.push("💡 Consider adding more H2 sections to better organize your H3 subsections");
  }
  
  return issues;
}

function generateImprovedSuggestions(headings) {
  if (headings.length === 0) {
    return [
      {level: 1, text: "Add a main page title (H1)"},
      {level: 2, text: "Add section headings (H2)"},
      {level: 3, text: "Add subsection headings (H3) as needed"}
    ];
  }
  
  const suggestions = [];
  
  // Always start with H1
  suggestions.push({
    level: 1,
    text: headings[0].text
  });
  
  // Process remaining headings with smart grouping
  for (let i = 1; i < headings.length; i++) {
    const heading = headings[i];
    const previousSuggestion = suggestions[suggestions.length - 1];
    
    // Smart content categorization
    const isArticleTitle = isArticleOrGuide(heading.text);
    const isSectionHeader = isSectionTitle(heading.text);
    const isFooterContent = isFooterOrCallToAction(heading.text);
    
    let suggestedLevel = 2; // Default to H2
    
    if (isSectionHeader) {
      // Main section headers should be H2
      suggestedLevel = 2;
    } else if (isArticleTitle && previousSuggestion && previousSuggestion.level <= 2) {
      // Articles under a section should be H3
      suggestedLevel = 3;
      
      // But if there's no "articles" section yet, create one
      if (!hasRecentArticlesSection(suggestions)) {
        suggestions.push({
          level: 2,
          text: "Recent Articles"
        });
      }
    } else if (isFooterContent) {
      suggestedLevel = 2;
    } else {
      // Default organization
      suggestedLevel = Math.min(heading.level, previousSuggestion.level + 1);
    }
    
    suggestions.push({
      level: suggestedLevel,
      text: heading.text
    });
  }
  
  return suggestions;
}

function isArticleOrGuide(text) {
  const lowerText = text.toLowerCase();
  return lowerText.includes('guide') || 
         lowerText.includes('how to') ||
         lowerText.includes('tutorial') ||
         lowerText.includes('tips') ||
         /\d{4}/.test(text) || // Contains year
         lowerText.includes('detection') ||
         lowerText.includes('secure') ||
         lowerText.includes('automate');
}

function isSectionTitle(text) {
  const lowerText = text.toLowerCase();
  return lowerText.includes('blog posts') ||
         lowerText.includes('articles') ||
         lowerText.includes('news') ||
         lowerText.includes('updates') ||
         lowerText.includes('more');
}

function isFooterOrCallToAction(text) {
  const lowerText = text.toLowerCase();
  return lowerText.includes('subscribe') ||
         lowerText.includes('contact') ||
         lowerText.includes('making every') ||
         lowerText.includes('day-in-the-life') ||
         lowerText.includes('get started') ||
         lowerText.includes('learn more');
}

function hasRecentArticlesSection(suggestions) {
  return suggestions.some(s => 
    s.level === 2 && 
    (s.text.toLowerCase().includes('article') || 
     s.text.toLowerCase().includes('blog') ||
     s.text.toLowerCase().includes('post'))
  );
}
