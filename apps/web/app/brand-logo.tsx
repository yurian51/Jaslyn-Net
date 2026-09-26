type BrandLogoProps = {
  alt?: string;
  className?: string;
  loading?: 'eager' | 'lazy';
};

export default function BrandLogo({ alt = 'JASLYN NET', className, loading = 'eager' }: BrandLogoProps) {
  return (
    <picture>
      <source srcSet="/ram-logo-scalable.svg" type="image/svg+xml" />
      <img
        src="/1000242339.png"
        srcSet="/1000242339.png 1x, /capricon.png 2x"
        alt={alt}
        className={className}
        loading={loading}
        decoding="async"
      />
    </picture>
  );
}
