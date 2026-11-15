import React, { useState } from 'react';
import { Flower2 } from 'lucide-react';

interface EditorialImageProps {
  src: string;
  alt: string;
  caption?: string;
  className?: string;
}

export const EditorialImage: React.FC<EditorialImageProps> = ({
  src,
  alt,
  caption,
  className = '',
}) => {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#fbf0f6] via-[#f5eaf4] to-[#ead9eb] p-8 text-center ${className}`}
        role="img"
        aria-label={alt}
      >
        <Flower2 className="h-8 w-8 text-[#8E3B6E]/70" aria-hidden="true" />
        <p className="mt-3 font-editorial text-lg font-medium text-[#231420]">
          {caption || alt}
        </p>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={className}
      loading="eager"
    />
  );
};
