import React, { useState, useEffect, useRef } from "react";

const Sliding: React.FC = () => {
  const [mouseX, setMouseX] = useState(0);
  const [mouseY, setMouseY] = useState(0);
  const [divPosition, setDivPosition] = useState({ x: 0, y: 0 });
  const [center, setCenter] = useState({ x: 0, y: 0 });
  const [isMouseInside, setIsMouseInside] = useState(false);
  const r = useRef(200); // Fixed diameter

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      setMouseX(event.clientX);
      setMouseY(event.clientY);
    };

    const parentElement = document.getElementById("app-container");
    if (!parentElement) return;

    const handleMouseEnter = () => {
      setIsMouseInside(true);
      window.addEventListener("mousemove", handleMouseMove);
    };

    const handleMouseLeave = () => {
      setIsMouseInside(false);
      window.removeEventListener("mousemove", handleMouseMove);
      const parentElement = document.getElementById("app-container");
      if (!parentElement) return;

      const parentRect = parentElement.getBoundingClientRect();
      const centerX = parentRect.width / 2;
      const centerY = parentRect.height / 2;

      setDivPosition({ x: centerX, y: centerY });
    };

    parentElement.addEventListener("mouseenter", handleMouseEnter);
    parentElement.addEventListener("mouseleave", handleMouseLeave);

    // Cleanup event listeners on unmount
    return () => {
      parentElement.removeEventListener("mouseenter", handleMouseEnter);
      parentElement.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  useEffect(() => {
    const parentElement = document.getElementById("app-container");
    if (!parentElement) return;

    const parentRect = parentElement.getBoundingClientRect();
    const centerX = parentRect.width / 2;
    const centerY = parentRect.height / 2;
    r.current = Math.min(centerX, centerY);

    setCenter({ x: centerX, y: centerY });

    const d = Math.sqrt(
      Math.pow(mouseX - (parentRect.left + centerX), 2) +
        Math.pow(mouseY - (parentRect.top + centerY), 2)
    );
    const distance = r.current * Math.pow(2, -d / r.current);

    // Calculate the angle from the mouse to the center, then reverse it for opposite direction
    const angle =
      Math.atan2(
        mouseY - (parentRect.top + centerY),
        mouseX - (parentRect.left + centerX)
      ) + Math.PI;
    const newX = centerX + distance * Math.cos(angle);
    const newY = centerY + distance * Math.sin(angle);

    setDivPosition({ x: newX, y: newY });
  }, [mouseX, mouseY, r]);

  return (
    <div className="flex flex-row items-center justify-center h-full w-full p-10">
      <div
        id="app-container"
        className="flex-1 relative w-full h-full bg-background text-foreground border border-gray-400 rounded-xl"
      >
        <div
          style={{ left: center.x, top: center.y }}
          className="absolute transform -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-gray-600 rounded-full"
        />
        <button
          style={{
            left: divPosition.x,
            top: divPosition.y,
            transition: isMouseInside ? "none" : "all 0.2s",
          }}
          className="absolute transform -translate-x-1/2 -translate-y-1/2 bg-accent rounded-md text-sm font-medium p-2"
        >
          PRESS ME
        </button>
      </div>
    </div>
  );
};

export default Sliding;
