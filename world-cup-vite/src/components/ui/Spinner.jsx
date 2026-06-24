export default function Spinner({ size = 24 }) {
  return (
    <div
      className="spinner"
      style={{ width: size, height: size, borderWidth: size < 20 ? 2 : 3 }}
      aria-label="Loading"
    />
  );
}
