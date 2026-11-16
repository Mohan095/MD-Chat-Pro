import { useState, useEffect } from 'react';

export function useResponsive() {
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    isMobile: typeof window !== 'undefined' ? window.innerWidth < 768 : false,
    isTablet:
      typeof window !== 'undefined'
        ? window.innerWidth >= 768 && window.innerWidth < 1100
        : false,
    isDesktop: typeof window !== 'undefined' ? window.innerWidth >= 1100 : true,
  }));

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      setViewport({
        width: w,
        isMobile: w < 768,
        isTablet: w >= 768 && w < 1100,
        isDesktop: w >= 1100,
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return viewport;
}
