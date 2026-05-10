/**
 * Search Utilities
 * Search relevance scoring and optimization
 */

import type { VideoItem } from '@/lib/types';
import { simplifiedToTraditional, traditionalToSimplified } from '@/lib/utils/chinese-convert';

function getSearchVariants(text: string): string[] {
  const normalized = text.toLowerCase().trim();
  if (!normalized) return [];

  const variants = new Set<string>([
    normalized,
    traditionalToSimplified(normalized),
    simplifiedToTraditional(normalized),
  ]);

  return Array.from(variants).filter(Boolean);
}

function includesAnyVariant(target: string, keyword: string): boolean {
  const targetVariants = getSearchVariants(target);
  const keywordVariants = getSearchVariants(keyword);
  return keywordVariants.some(kw => targetVariants.some(tv => tv.includes(kw)));
}

/**
 * Check if title contains at least 2 consecutive characters from search query
 * This filters out irrelevant results
 */
export function hasMinimumMatch(title: string, query: string): boolean {
  const titleVariants = getSearchVariants(title);
  const queryVariants = getSearchVariants(query);

  for (const queryVariant of queryVariants) {
    // Extract all 2+ character substrings from query variants
    for (let i = 0; i <= queryVariant.length - 2; i++) {
      const substring = queryVariant.slice(i, i + 2);
      if (titleVariants.some(tv => tv.includes(substring))) {
        return true;
      }
    }

    // Keep single-character fallback behavior for short queries
    if (queryVariant.length === 1 && titleVariants.some(tv => tv.includes(queryVariant))) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate search relevance score
 * Higher score = more relevant to the search query
 */
export function calculateRelevanceScore(item: VideoItem, query: string): number {
  let score = 0;
  const normalizedQuery = query.toLowerCase().trim();
  const normalizedTitle = item.vod_name.toLowerCase();
  const queryVariants = getSearchVariants(normalizedQuery);
  const titleVariants = getSearchVariants(normalizedTitle);

  // Split query into words for partial matching
  const queryWords = normalizedQuery.split(/\s+/);

  // 1. Exact title match (highest priority)
  if (queryVariants.some(q => titleVariants.some(t => t === q))) {
    score += 1000;
    return score; // Early return for perfect match
  }

  // 2. Title starts with query (very high priority)
  if (queryVariants.some(q => titleVariants.some(t => t.startsWith(q)))) {
    score += 500;
  }

  // 3. Title contains full query as substring
  if (includesAnyVariant(normalizedTitle, normalizedQuery)) {
    score += 200;

    // Bonus for query appearing earlier in title
    const positions = queryVariants
      .flatMap(q => titleVariants.map(t => t.indexOf(q)))
      .filter(p => p >= 0);
    const bestPosition = positions.length > 0 ? Math.min(...positions) : 0;
    score += Math.max(0, 50 - bestPosition * 2);
  }

  // 4. All query words present in title
  const allWordsPresent = queryWords.every(word => includesAnyVariant(normalizedTitle, word));
  if (allWordsPresent && queryWords.length > 1) {
    score += 100;
  }

  // 5. Individual word matches
  queryWords.forEach(word => {
    if (word.length < 2) return; // Skip very short words

    if (includesAnyVariant(normalizedTitle, word)) {
      score += 30;

      // Bonus if word is at the start
      if (titleVariants.some(t => getSearchVariants(word).some(w => t.startsWith(w)))) {
        score += 20;
      }
    }
  });

  // 6. Actor match
  if (item.vod_actor) {
    const normalizedActor = item.vod_actor.toLowerCase();
    if (includesAnyVariant(normalizedActor, normalizedQuery)) {
      score += 80;
    }
    queryWords.forEach(word => {
      if (word.length >= 2 && includesAnyVariant(normalizedActor, word)) {
        score += 15;
      }
    });
  }

  // 7. Director match
  if (item.vod_director) {
    const normalizedDirector = item.vod_director.toLowerCase();
    if (includesAnyVariant(normalizedDirector, normalizedQuery)) {
      score += 60;
    }
    queryWords.forEach(word => {
      if (word.length >= 2 && includesAnyVariant(normalizedDirector, word)) {
        score += 10;
      }
    });
  }

  // 8. Content/description match (if available)
  if (item.vod_content) {
    const normalizedContent = item.vod_content.toLowerCase();
    if (includesAnyVariant(normalizedContent, normalizedQuery)) {
      score += 20;
    }
  }

  // 9. Recent year bonus (favor newer content)
  const currentYear = new Date().getFullYear();
  const itemYear = parseInt(item.vod_year || '0');
  if (itemYear > 0) {
    const yearDiff = currentYear - itemYear;
    if (yearDiff === 0) {
      score += 15; // Current year
    } else if (yearDiff === 1) {
      score += 10; // Last year
    } else if (yearDiff <= 3) {
      score += 5; // Within 3 years
    }
  }

  // 10. Penalty for very long titles (might be less relevant)
  if (item.vod_name.length > 50) {
    score -= 5;
  }

  // 11. Bonus for HD/quality indicators in remarks
  if (item.vod_remarks) {
    const remarks = item.vod_remarks.toLowerCase();
    if (remarks.includes('hd') || remarks.includes('1080') || remarks.includes('4k')) {
      score += 5;
    }
    if (remarks.includes('完结') || remarks.includes('全集')) {
      score += 3;
    }
  }

  return Math.max(0, score); // Ensure non-negative
}

