export default function ErrorBox({ message }) {
  return (
    <div className="error-box">
      <span className="error-icon">!</span>
      {message}
    </div>
  );
}
