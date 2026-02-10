#!/bin/bash

# Monitor session files to verify .md storage
# Usage: ./scripts/monitor-session-files.sh [session-id]

set -euo pipefail

SESSION_ID="${1:-}"
FILES_DIR="${HOME}/.openclaw/agents"

echo "🔍 Monitoring session files..."
echo "Watching: ${FILES_DIR}"
echo "Press Ctrl+C to stop"
echo ""

if [[ -n "$SESSION_ID" ]]; then
  echo "Filtering for session: $SESSION_ID"
  echo ""
fi

while true; do
  clear
  echo "=== Session Files Monitor ==="
  echo "Time: $(date '+%Y-%m-%d %H:%M:%S')"
  echo ""
  
  if [[ -n "$SESSION_ID" ]]; then
    SESSION_PATH=$(find "$FILES_DIR" -type d -name "$SESSION_ID" 2>/dev/null | head -1)
    if [[ -n "$SESSION_PATH" ]]; then
      FILES_PATH="$SESSION_PATH/files"
      echo "Session: $SESSION_ID"
      echo "Path: $FILES_PATH"
      echo ""
      
      if [[ -d "$FILES_PATH" ]]; then
        echo "📄 Files:"
        ls -lht "$FILES_PATH" 2>/dev/null | grep -E "\.(md|raw|parsed\.json)$" | head -10 || echo "  No files found"
        echo ""
        
        MD_COUNT=$(find "$FILES_PATH" -name "*.md" -type f 2>/dev/null | wc -l | tr -d ' ')
        RAW_COUNT=$(find "$FILES_PATH" -name "*.raw" -type f 2>/dev/null | wc -l | tr -d ' ')
        PARSED_COUNT=$(find "$FILES_PATH" -name "*.parsed.json" -type f 2>/dev/null | wc -l | tr -d ' ')
        
        echo "📊 Summary:"
        echo "  .md files:     $MD_COUNT"
        echo "  .raw files:    $RAW_COUNT"
        echo "  .parsed.json:  $PARSED_COUNT"
        
        if [[ $RAW_COUNT -gt 0 ]]; then
          echo ""
          echo "⚠️  WARNING: Found .raw files (should be .md only)"
        fi
      else
        echo "  Files directory not found"
      fi
    else
      echo "  Session not found"
    fi
  else
    echo "All sessions:"
    echo ""
    
    # Show recent files across all sessions
    find "$FILES_DIR" -type f \( -name "*.md" -o -name "*.raw" \) -mmin -5 2>/dev/null | \
      while read -r file; do
        rel_path="${file#$FILES_DIR/}"
        size=$(ls -lh "$file" 2>/dev/null | awk '{print $5}')
        modified=$(stat -f "%Sm" -t "%H:%M:%S" "$file" 2>/dev/null || stat -c "%y" "$file" 2>/dev/null | cut -d' ' -f2 | cut -d'.' -f1)
        echo "  $rel_path ($size, modified: $modified)"
      done | head -20
    
    echo ""
    MD_TOTAL=$(find "$FILES_DIR" -name "*.md" -type f 2>/dev/null | wc -l | tr -d ' ')
    RAW_TOTAL=$(find "$FILES_DIR" -name "*.raw" -type f 2>/dev/null | wc -l | tr -d ' ')
    
    echo "📊 Total:"
    echo "  .md files:  $MD_TOTAL"
    echo "  .raw files: $RAW_TOTAL"
  fi
  
  echo ""
  echo "Refreshing in 2 seconds... (Ctrl+C to stop)"
  sleep 2
done
