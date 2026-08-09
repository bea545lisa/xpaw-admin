/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef } from "react";

export function useInfiniteScroll({
  products,
  pageInfo,
  loadMoreFetcher,
  loadMoreRef,
  enabled,
}) {
  const isLoadingRef = useRef(false);
  //const hasUserScrolledRef = useRef(false);
  //const hasTriggeredRef = useRef(false);

  // ✅ merkt ob User gescrollt hat
  useEffect(() => {
    const onScroll = () => {
      //hasUserScrolledRef.current = true;
    };

    window.addEventListener("scroll", onScroll);

    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ✅ reset loading flag
  useEffect(() => {
    if (loadMoreFetcher.state === "idle") {
      isLoadingRef.current = false;
      //hasTriggeredRef.current = false; // 🔥 DAS HINZUFÜGEN
    }
  }, [loadMoreFetcher.state]);

  // ✅ observer
  useEffect(() => {
    if (!enabled || !pageInfo?.hasNextPage) return;

    const el = loadMoreRef.current;
    if (!el) return;

    let wasIntersecting = false; // 🔥 merkt sich Zustand

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];

        // 🔥 nur reagieren wenn Zustand wechselt
        if (first.isIntersecting && !wasIntersecting) {
          wasIntersecting = true;

          if (isLoadingRef.current) return;
          if (loadMoreFetcher.state !== "idle") return;

          const last = products.at(-1);
          if (!last?.cursor) return;

          isLoadingRef.current = true;

          const params = new URLSearchParams(window.location.search);
          params.set("cursor", last.cursor);
          params.set("limit", 10); // 🔥 hinzufügen

          loadMoreFetcher.load(
            `${window.location.pathname}?index&${params.toString()}`
          );

        }

        // 🔥 reset wenn Element wieder rausgeht
        if (!first.isIntersecting) {
          wasIntersecting = false;
        }
      },
      {
        rootMargin: "200px",
      }
    );

    observer.observe(el);

    return () => observer.disconnect();
  }, [enabled, pageInfo, products, loadMoreFetcher.state]);
}
