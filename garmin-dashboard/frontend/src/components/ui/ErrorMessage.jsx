export default function ErrorMessage({ message }) {
  return (
    <div className="error-box">
      <span className="error-icon">!</span>
      <p>{message}</p>
    </div>
  );
}
