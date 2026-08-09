import { useState, useRef, useMemo } from "react";

export function useProductTags({ initialTags, allTags, fetcher, productId }) {
  const [localTags, setLocalTags] = useState(initialTags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [showTagSearch, setShowTagSearch] = useState(false);
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const tagInputRef = useRef(null);

  const [tagSuggestions, setTagSuggestions] = useState([]);


  const handleTagAdd = () => {
    const tag = tagInput.trim();
    if (!tag || localTags.includes(tag)) { setTagInput(""); return; }
    const newTags = [...localTags, tag];
    setLocalTags(newTags);
    setTagInput("");
    fetcher.submit(
      { action: "updateTags", id: productId, tags: JSON.stringify(newTags) },
      { method: "POST" }
    );
  };

  const handleTagRemove = (tag) => {
    const newTags = localTags.filter((t) => t !== tag);
    setLocalTags(newTags);
    fetcher.submit(
      { action: "updateTags", id: productId, tags: JSON.stringify(newTags) },
      { method: "POST" }
    );
  };

  return {
    localTags, setLocalTags, tagInput, setTagInput,
    showTagSearch, setShowTagSearch,
    showTagSuggestions, setShowTagSuggestions,
    tagSuggestions,setTagSuggestions,
    tagInputRef,
    handleTagAdd, handleTagRemove,
  };
}
