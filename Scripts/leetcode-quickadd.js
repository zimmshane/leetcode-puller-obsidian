/**
 * LeetCode Problem Fetcher for Obsidian
 * 
 * This script fetches problem data from LeetCode using an API and formats it for use in Obsidian notes.
 * It's designed to work with the QuickAdd plugin for Obsidian.
 */

// Utility functions for notifications and logging
const notice = msg => new Notice(msg, 5000);
const log = msg => console.log(msg);

// Constants
const API_URL = "https://alfa-leetcode-api.onrender.com/select";
// const API_URL = "http://localhost:3000/select";
const TAG_PREFIX_SETTING = "LeetCode Tag Prefix";

// QuickAdd module configuration
module.exports = {
    entry: start,
    settings: {
        name: "LeetCode Puller",
        author: "Shane Zimmerman",
        options: {
            [TAG_PREFIX_SETTING]: {
                type: "text",
                defaultValue: "leetcode/",
                placeholder: "Enter tag prefix (e.g., leetcode/)",
                description: "Prefix to be added to LeetCode tags.",
            }
        }
    }
}

// Global variables to store QuickAdd API and settings
let QuickAdd;
let Settings;

/**
 * Main entry point for the script
 * @param {Object} params - QuickAdd parameters
 * @param {Object} settings - User-defined settings
 */
async function start(params, settings) {
    QuickAdd = params;
    Settings = settings;

    const input = await promptForInput();
    if (!input) return;

    const titleSlug = extractTitleSlug(input);
    if (!titleSlug) return;

    const problemData = await getLeetCodeProblem(titleSlug);
    if (!problemData) return;

    setQuickAddVariables(problemData);
}

/**
 * Prompts the user for a LeetCode problem title slug or URL
 * @returns {string|null} The entered input or null if cancelled
 */
async function promptForInput() {
    const input = await QuickAdd.quickAddApi.inputPrompt("Enter LeetCode problem title slug or URL:");
    if (!input) {
        notice("No input entered.");
        return null;
    }
    return input;
}

/**
 * Extracts the title slug from the input (URL or title slug)
 * @param {string} input - The user input (URL or title slug)
 * @returns {string|null} The extracted title slug or null if invalid
 */
function extractTitleSlug(input) {
    // Check if the input is a URL
    if (input.startsWith('http://') || input.startsWith('https://')) {
        const url = new URL(input);
        const pathParts = url.pathname.split('/');
        const problemsIndex = pathParts.indexOf('problems');
        if (problemsIndex !== -1 && problemsIndex < pathParts.length - 1) {
            return pathParts[problemsIndex + 1];
        } else {
            notice("Invalid LeetCode URL. Unable to extract title slug.");
            return null;
        }
    }
    // If not a URL, assume it's already a title slug
    return input;
}

/**
 * Fetches problem data from the LeetCode API
 * @param {string} titleSlug - The title slug of the LeetCode problem
 * @returns {Object|null} Problem data object or null if fetching failed
 */
async function getLeetCodeProblem(titleSlug) {
    try {
        const response = await request({
            url: `${API_URL}?titleSlug=${titleSlug}`,
            method: 'GET',
            cache: 'no-cache',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        const data = JSON.parse(response);
        log("API Response:", JSON.stringify(data, null, 2));

        return {
            id: data.questionFrontendId || "",
            title: data.questionTitle || "",
            difficulty: data.difficulty || "",
            link: data.link || `https://leetcode.com/problems/${titleSlug}`,
            topicTags: data.topicTags || [],
            problemStatement: formatProblemStatement(data.question || ""),
            hints: data.hints || [],
        };
    } catch (error) {
        console.error('Error fetching LeetCode problem:', error);
        notice("Failed to fetch problem data.");
        return null;
    }
}

/**
 * Sets QuickAdd variables with the fetched problem data
 * @param {Object} problemData - The fetched problem data
 */
function setQuickAddVariables(problemData) {
    QuickAdd.variables = {
        ...problemData,
        fileName: `${problemData.id}. ${replaceIllegalFileNameCharactersInString(problemData.title)}`,
        difficultyLink: `[[${problemData.difficulty}]]`,
        tags: formatTags(problemData.topicTags),
        formattedHints: formatHints(problemData.hints),
    };
}

/**
 * Formats the problem statement HTML into Markdown
 * @param {string} html - The HTML problem statement
 * @returns {string} Formatted Markdown problem statement
 */
function formatProblemStatement(html) {
    if (!html) return "";
    
    let markdown = convertHtmlToMarkdown(html);
    markdown = formatExamples(markdown);
    markdown = formatConstraints(markdown);
    markdown = formatFollowUp(markdown);

    return markdown.replace(/\n{3,}/g, '\n\n').replace(/`+$/gm, '`').trim();
}

/**
 * Converts HTML to Markdown
 * @param {string} html - The HTML to convert
 * @returns {string} Converted Markdown
 */
function convertHtmlToMarkdown(html) {
    let markdown = html
        .replace(/<p>/g, '\n\n')
        .replace(/<\/p>/g, '')
        .replace(/<code>/g, '`')
        .replace(/<\/code>/g, '`')
        .replace(/<em>/g, '*')
        .replace(/<\/em>/g, '*')
        .replace(/<strong[^>]*>/g, '')
        .replace(/<\/strong>/g, '')
        .replace(/<pre>/g, '`')
        .replace(/<\/pre>/g, '`')
        .replace(/<sup>(.*?)<\/sup>/g, '^$1')
        .replace(/<font[^>]*>/g, '')
        .replace(/<\/font>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&#39;/g,'\'')
        .replace(/<img[^>]*src="([^"]*)"[^>]*>/g, '![]($1)')
        .replace(/<span class="example-io">(.*?)<\/span>/g, '$1')
        .replace(/&quot;/g,'"');

    return formatLists(markdown);
}

/**
 * Formats HTML lists into Markdown lists
 * @param {string} markdown - The Markdown to format
 * @returns {string} Markdown with formatted lists
 */
function formatLists(markdown) {
    let listStack = [];
    let listItemNumber = {};

    return markdown.replace(/<\/?(?:ul|ol|li)>/g, (match, offset, string) => {
        switch (match) {
            case '<ul>':
                listStack.push('ul');
                return '\n';
            case '<ol>':
                listStack.push('ol');
                listItemNumber[listStack.length] = 1;
                return '\n';
            case '</ul>':
            case '</ol>':
                listStack.pop();
                return '\n';
            case '<li>':
                let indent = '  '.repeat(listStack.length - 1);
                if (listStack[listStack.length - 1] === 'ul') {
                    return `\n${indent}- `;
                } else {
                    let number = listItemNumber[listStack.length];
                    listItemNumber[listStack.length]++;
                    return `\n${indent}${number}. `;
                }
            case '</li>':
                return '';
        }
    });
}

/**
 * Formats examples in the problem statement
 * @param {string} markdown - The Markdown to format
 * @returns {string} Markdown with formatted examples
 */
function formatExamples(markdown) {
    // console.log(markdown); 
    let exampleCount = 1;
    return markdown.replace(/Example \d+:([\s\S]*?)(?=Example \d+:|Constraints:|Follow-up:|$)/g, (match, content) => {
        const imageMatch = content.match(/!\[.*?\]\((.*?)\)/);
        const inputMatch = content.match(/Input:.*?([\s\S]*?)(?=<\/div>|Output|$)/i);
        const outputMatch = content.match(/Output:.*?([\s\S]*?)(?=<\/div>|Explanation|$)/i);
        const explanationMatch = content.match(/Explanation:.*?([\s\S]*)/i); 

        let formattedExample = `>[!Example]+ Example ${exampleCount}\n`;
        if (imageMatch) {
            formattedExample += `>![](${imageMatch[1]})\n>\n`;
        }
        if (inputMatch) {
            formattedExample += `>**Input**: \`${inputMatch[1].trim()}\`\n`;
        }
        if (outputMatch) {
            formattedExample += `>**Output**: \`${outputMatch[1].trim()}\`\n`;
        }
        if (explanationMatch) {
            let explanation = explanationMatch[1]
                .trim()
                .replace(/<\/?div>/g, '') 
                .replace(/`$/, '') 
                .replace(/\n/g, ' ') 
                .replace(/(\d+\))\s?/g, '\n> $1 '); 

            formattedExample += `>**Explanation**:\n>${explanation}\n`;
        }

        exampleCount++;
        return formattedExample + '\n';
    });
}

/**
 * Formats constraints in the problem statement
 * @param {string} markdown - The Markdown to format
 * @returns {string} Markdown with formatted constraints
 */
function formatConstraints(markdown) {
    const constraintsMatch = markdown.match(/Constraints:([\s\S]*?)(?=Follow-up:|$)/);
    if (constraintsMatch) {
        const constraintsContent = constraintsMatch[1].trim().split('\n').map(line => '>' + line.trim()).join('\n');
        return markdown.replace(/Constraints:[\s\S]*?(?=Follow-up:|$)/, `>[!warning]+ Constraints\n${constraintsContent}\n\n`);
    }
    return markdown;
}

/**
 * Formats follow-up section in the problem statement
 * @param {string} markdown - The Markdown to format
 * @returns {string} Markdown with formatted follow-up section
 */
function formatFollowUp(markdown) {
    const followUpMatch = markdown.match(/Follow-up:([\s\S]*?)$/);
    if (followUpMatch) {
        const followUpContent = followUpMatch[1].trim();
        return markdown.replace(/Follow-up:[\s\S]*$/, `>[!Todo]- Follow Up\n>${followUpContent}\n`);
    }
    return markdown;
}

/**
 * Formats tags for the problem
 * @param {Array} tags - Array of tag objects
 * @returns {string} Formatted tag string
 */
function formatTags(tags) {
    if (!tags || !Array.isArray(tags)) return "";
    const prefix = Settings[TAG_PREFIX_SETTING] || "";
    return tags.map(tag => `   - ${prefix}${tag.slug.trim()}`).join('\n');
}

/**
 * Formats hints for the problem
 * @param {Array} hints - Array of hint strings
 * @returns {string} Formatted hints string
 */
function formatHints(hints) {
    if (!hints || hints.length === 0) return "No hints available.";
    return hints.map((hint, index) => `>[!Hint]- Hint ${index + 1}\n>${stripHtmlTags(hint).replace(/\n/g, '\n>')}`).join("\n\n");
}

/**
 * Strips HTML tags from a string
 * @param {string} html - The HTML string to strip
 * @returns {string} String without HTML tags
 */
function stripHtmlTags(html) {
    return html ? html.replace(/<[^>]*>/g, '') : "";
}

/**
 * Replaces illegal characters in a filename
 * @param {string} string - The string to process
 * @returns {string} String with illegal characters removed
 */
function replaceIllegalFileNameCharactersInString(string) {
    return string ? string.replace(/[\\,#%&{}/*<>$'":@]/g, '') : "";
}