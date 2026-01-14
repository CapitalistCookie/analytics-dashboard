#!/bin/bash
#
# list_todos.sh - List all TODO comments in the codebase
#
# This script scans the codebase for TODO comments and displays them
# organized by category and file. Use this as the source of truth for
# incomplete/deferred work instead of external markdown files.
#
# Usage:
#   ./scripts/list_todos.sh           # List all TODOs
#   ./scripts/list_todos.sh --count   # Show count only
#   ./scripts/list_todos.sh --by-type # Group by TODO type (feature, security, etc.)
#   ./scripts/list_todos.sh security  # Filter by category
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Directories to search
SEARCH_DIRS=(
    "$PROJECT_ROOT/backend"
    "$PROJECT_ROOT/frontend/src"
)

# File extensions to include
EXTENSIONS="py,ts,tsx,js,jsx"

show_help() {
    echo "Usage: $0 [OPTIONS] [FILTER]"
    echo ""
    echo "Options:"
    echo "  --count     Show count of TODOs only"
    echo "  --by-type   Group TODOs by type (feature, security, etc.)"
    echo "  --summary   Show summary by file"
    echo "  -h, --help  Show this help message"
    echo ""
    echo "Filter examples:"
    echo "  $0 security   # Show only TODO(security) items"
    echo "  $0 feature    # Show only TODO(feature) items"
    echo "  $0 api        # Show only TODO(api) items"
    echo ""
}

count_todos() {
    local count=0
    for dir in "${SEARCH_DIRS[@]}"; do
        if [[ -d "$dir" ]]; then
            count=$((count + $(grep -r "TODO" "$dir" --include="*.py" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" 2>/dev/null | wc -l)))
        fi
    done
    echo "$count"
}

list_by_type() {
    echo -e "${CYAN}=== TODOs by Type ===${NC}"
    echo ""

    # Extract TODO types and count them
    for dir in "${SEARCH_DIRS[@]}"; do
        if [[ -d "$dir" ]]; then
            grep -rh "TODO(" "$dir" --include="*.py" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" 2>/dev/null | \
                sed -n 's/.*TODO(\([^)]*\)).*/\1/p' | \
                sort | uniq -c | sort -rn
        fi
    done
}

list_summary() {
    echo -e "${CYAN}=== TODO Summary by File ===${NC}"
    echo ""

    for dir in "${SEARCH_DIRS[@]}"; do
        if [[ -d "$dir" ]]; then
            grep -rc "TODO" "$dir" --include="*.py" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" 2>/dev/null | \
                grep -v ":0$" | \
                sort -t: -k2 -rn | \
                while IFS=: read -r file count; do
                    rel_path="${file#$PROJECT_ROOT/}"
                    printf "  %3d  %s\n" "$count" "$rel_path"
                done
        fi
    done
}

list_todos() {
    local filter="$1"

    echo -e "${CYAN}=== TODO Items ===${NC}"
    echo ""

    for dir in "${SEARCH_DIRS[@]}"; do
        if [[ -d "$dir" ]]; then
            if [[ -n "$filter" ]]; then
                # Filter by category
                grep -rn "TODO($filter" "$dir" --include="*.py" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" 2>/dev/null | \
                    while IFS=: read -r file line content; do
                        rel_path="${file#$PROJECT_ROOT/}"
                        echo -e "${GREEN}$rel_path:$line${NC}"
                        echo -e "  ${YELLOW}${content}${NC}"
                        echo ""
                    done
            else
                # Show all TODOs
                grep -rn "TODO" "$dir" --include="*.py" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" 2>/dev/null | \
                    while IFS=: read -r file line content; do
                        rel_path="${file#$PROJECT_ROOT/}"
                        echo -e "${GREEN}$rel_path:$line${NC}"
                        echo -e "  ${YELLOW}${content}${NC}"
                        echo ""
                    done
            fi
        fi
    done
}

# Parse arguments
case "${1:-}" in
    -h|--help)
        show_help
        exit 0
        ;;
    --count)
        total=$(count_todos)
        echo -e "${CYAN}Total TODOs: ${YELLOW}$total${NC}"
        exit 0
        ;;
    --by-type)
        list_by_type
        exit 0
        ;;
    --summary)
        list_summary
        total=$(count_todos)
        echo ""
        echo -e "${CYAN}Total: ${YELLOW}$total TODOs${NC}"
        exit 0
        ;;
    *)
        list_todos "$1"
        total=$(count_todos)
        echo -e "${CYAN}Total: ${YELLOW}$total TODOs${NC}"
        exit 0
        ;;
esac
