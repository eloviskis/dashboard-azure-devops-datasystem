import React from 'react';

const Header = () => {
  return (
    <header className="bg-ds-dark-blue text-ds-light-text p-5 px-10 border-b border-ds-border flex items-center justify-between">
      <div className="flex items-center gap-4">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7V17L12 22L22 17V7L12 2Z" stroke="#64FFDA" strokeWidth="2" strokeLinejoin="round"/>
              <path d="M2 7L12 12M22 7L12 12M12 22V12" stroke="#64FFDA" strokeWidth="2" strokeLinejoin="round"/>
              <path d="M17 4.5L7 9.5" stroke="#64FFDA" strokeOpacity="0.7" strokeWidth="1.5" strokeLinejoin="round"/>
          </svg>
          <div className="font-sans">
              <h1 className="text-2xl font-bold tracking-wider">
                  <span className="text-white">DATA</span>
                  <span className="text-ds-green">SYSTEM</span>
              </h1>
              <p className="text-sm text-ds-text tracking-widest">DevOps Performance Dashboard</p>
          </div>
      </div>
    </header>
  );
};

export default Header;
