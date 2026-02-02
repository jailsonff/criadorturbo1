import { useRef, useCallback } from "react";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const MarkdownEditor = ({ value = "", onChange, placeholder, className }: MarkdownEditorProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  // Sync scroll between textarea and highlight overlay
  const handleScroll = useCallback(() => {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  // Render highlighted content
  const renderHighlightedContent = () => {
    if (!value) return null;

    const lines = value.split("\n");
    
    return lines.map((line, index) => {
      const isTitle = line.startsWith("## ");
      const isMainTitle = line.startsWith("# ") && !line.startsWith("## ");
      const isList = line.startsWith("- ");

      if (isTitle) {
        return (
          <div key={index} className="bg-primary/20 rounded px-1 -mx-1">
            <span className="text-primary font-bold">{line || " "}</span>
          </div>
        );
      }

      if (isMainTitle) {
        return (
          <div key={index} className="bg-amber-500/20 rounded px-1 -mx-1">
            <span className="text-amber-400 font-bold">{line || " "}</span>
          </div>
        );
      }

      if (isList) {
        return (
          <div key={index}>
            <span className="text-emerald-400">{line || " "}</span>
          </div>
        );
      }

      return (
        <div key={index}>
          <span className="text-foreground">{line || " "}</span>
        </div>
      );
    });
  };

  return (
    <div className={`relative ${className || ""}`}>
      {/* Highlight overlay - visible layer with styled text */}
      <div
        ref={highlightRef}
        className="absolute inset-0 p-3 font-mono text-sm whitespace-pre-wrap break-words overflow-auto pointer-events-none border border-transparent rounded-md"
        aria-hidden="true"
      >
        {renderHighlightedContent()}
      </div>

      {/* Actual textarea - invisible text, only for input */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={handleScroll}
        placeholder={placeholder}
        className="w-full h-full min-h-[500px] p-3 font-mono text-sm bg-transparent border border-border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background relative z-10 text-transparent caret-primary selection:bg-primary/30"
      />
    </div>
  );
};

export default MarkdownEditor;
