import React from "react";

const MainFooter: React.FC = () => {
  return (
    <footer className="swiss-footer">
      <span>© {new Date().getFullYear()} RuaMond</span>
      <span>
        Code, notes & experiments<span className="swiss-accent">.</span>
      </span>
    </footer>
  );
};

export default MainFooter;
