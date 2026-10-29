// FlightsMojo: text going into the reply editor must always parse.
//
// Chatwoot's Markdown tokenizer always recognises code blocks, quotes and
// lists, but some channels have no such nodes (API = website tickets, SMS,
// Telegram, Instagram, TikTok…). `stripUnsupportedFormatting` removes that
// syntax with regexes before parsing; whatever slips past them makes the
// parser throw ("Token type `code_block` not supported by Markdown parser")
// and the insert silently does nothing. The usual culprit is text pasted from
// Word: lines starting with a Tab ("\t• item"), which Markdown reads as an
// indented code block — and which email and chat show as a grey monospace box.

import { MessageMarkdownTransformer } from '@chatwoot/prosemirror-schema';

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const CODE_INDENT = /^(?:\t| {4})/;
// Characters Markdown can give meaning to. Not `{` `}`: canned responses keep
// unresolved Liquid variables ({{contact.name}}) for the backend.
const MARKDOWN_PUNCTUATION = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`|~]/g;

/**
 * Removes the leading Tab / 4+ spaces that turn a line into a Markdown code
 * block. Lines inside ``` or ~~~ fences are left as they are.
 */
export const unindentPastedText = content => {
  if (!content || typeof content !== 'string') return content;

  let openFence = null;
  return content
    .split('\n')
    .map(line => {
      const fence = line.match(FENCE)?.[1];
      if (fence) {
        if (!openFence) {
          openFence = fence;
        } else if (
          fence[0] === openFence[0] &&
          fence.length >= openFence.length
        ) {
          openFence = null;
        }
        return line;
      }
      if (openFence || !CODE_INDENT.test(line)) return line;
      return line.replace(/^[\t ]+/, '');
    })
    .join('\n');
};

// Every line flush left and every Markdown character escaped: parses as plain
// paragraphs in any schema, and reads exactly as typed.
const toPlainText = content =>
  content
    .split('\n')
    .map(line => line.trimStart().replace(MARKDOWN_PUNCTUATION, '\\$&'))
    .join('\n');

const parses = (content, schema) => {
  try {
    new MessageMarkdownTransformer(schema).parse(content);
    return true;
  } catch {
    return false;
  }
};

/**
 * Returns `content` unchanged when the editor schema can hold it; otherwise
 * the least-changed text it can: first without code-block indentation, and as
 * a last resort as plain text, so an insert never fails.
 * Only acts on a real ProseMirror schema (tests pass plain stand-in objects).
 */
export const ensureParseable = (content, schema) => {
  if (!content || typeof content !== 'string') return content;
  if (typeof schema?.nodes?.doc?.create !== 'function') return content;
  if (parses(content, schema)) return content;

  const unindented = unindentPastedText(content);
  if (parses(unindented, schema)) return unindented;

  return toPlainText(unindented);
};
