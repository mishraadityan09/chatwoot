import {
  buildMessageSchema,
  MessageMarkdownTransformer,
} from '@chatwoot/prosemirror-schema';
import { FORMATTING } from 'dashboard/constants/editor';
import {
  getContentNode,
  stripUnsupportedFormatting,
} from 'dashboard/helper/editorHelper';
import { ensureParseable, unindentPastedText } from '../messageMarkdown';

const schemaFor = channel =>
  buildMessageSchema(FORMATTING[channel].marks, FORMATTING[channel].nodes);
const apiSchema = schemaFor('Channel::Api'); // website tickets
const emailSchema = schemaFor('Channel::Email');

const parse = (schema, content) =>
  new MessageMarkdownTransformer(schema).parse(content);
const nodeTypes = doc => {
  const types = [];
  doc.descendants(node => {
    types.push(node.type.name);
  });
  return types;
};

// Shape of the live canned response that crashed (pasted from Word).
const TRIP_SHIELD =
  'Dear {{contact.name}},\n\nRefunds are considered in situations such as:\n\n' +
  '\t• Medical illness or injury\n\n\t• Pregnancy-related complications\n\n' +
  'Warm regards,\n\nTeam FlightsMojo';

describe('unindentPastedText', () => {
  it('drops the Tab / 4+ spaces that make a line a code block', () => {
    expect(unindentPastedText('a\n\n\t• one\n    • two\n\t')).toBe(
      'a\n\n• one\n• two\n'
    );
  });

  it('keeps shorter indentation and fenced code as they are', () => {
    const content = '  - item\n```\n    code stays\n```\n~~~\n\tkept\n~~~';
    expect(unindentPastedText(content)).toBe(content);
  });

  it('passes non-strings through', () => {
    expect(unindentPastedText(null)).toBeNull();
    expect(unindentPastedText('')).toBe('');
  });
});

describe('ensureParseable', () => {
  it('returns content the schema can hold unchanged', () => {
    expect(ensureParseable('**bold** and *em*', apiSchema)).toBe(
      '**bold** and *em*'
    );
  });

  it('un-indents a Word-pasted list for a schema without code blocks', () => {
    expect(() => parse(apiSchema, TRIP_SHIELD)).toThrow(/code_block/);

    const result = ensureParseable(TRIP_SHIELD, apiSchema);
    expect(result).toContain('\n• Medical illness or injury');
    expect(parse(apiSchema, result).textContent).toContain(
      '• Pregnancy-related complications'
    );
  });

  it('falls back to plain text that reads as typed', () => {
    const content = '  > quoted\n~~~\ncode\n~~~\nPrice 1.5 * 2 = {{total}}';
    expect(() => parse(apiSchema, content)).toThrow();

    const doc = parse(apiSchema, ensureParseable(content, apiSchema));
    expect(doc.textContent).toContain('> quoted');
    expect(doc.textContent).toContain('~~~');
    expect(doc.textContent).toContain('Price 1.5 * 2 = {{total}}');
  });

  it('leaves stand-in schemas (as used in upstream specs) alone', () => {
    expect(ensureParseable('\tcode', { marks: {}, nodes: {} })).toBe('\tcode');
  });
});

describe('editor hooks', () => {
  it('stripUnsupportedFormatting always returns parseable Markdown', () => {
    const result = stripUnsupportedFormatting(TRIP_SHIELD, apiSchema);
    expect(() => parse(apiSchema, result)).not.toThrow();
  });

  it('inserts the crashing canned response into a website ticket', () => {
    const editorView = { state: { schema: apiSchema } };
    const { node } = getContentNode(
      editorView,
      'cannedResponse',
      TRIP_SHIELD,
      { from: 0, to: 0 },
      {}
    );

    expect(node.textContent).toContain('• Medical illness or injury');
  });

  it('sends Tab-indented bullets as text, not a code box, in email too', () => {
    const editorView = { state: { schema: emailSchema } };
    const { node } = getContentNode(
      editorView,
      'cannedResponse',
      TRIP_SHIELD,
      { from: 0, to: 0 },
      {}
    );

    expect(nodeTypes(node)).not.toContain('code_block');
    expect(node.textContent).toContain('• Medical illness or injury');
  });
});
