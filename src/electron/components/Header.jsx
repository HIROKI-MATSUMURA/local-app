import React from 'react';
import '../styles/Header.scss';

const Header = ({ title, description }) => {
  return (
    <div className="page-header">
      <div className="header-content">
        <div className="header-text">
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
      </div>
      <div className="header-decoration"></div>
    </div>
  );
};

export default Header;
