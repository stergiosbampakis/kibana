import React from 'react';

export default React.createClass({
  render() {
    const {height, width} = this.props.workpad;

    const style = {
      height: height,
      width: width,
      boxShadow: '0px 0px 5px 0px rgba(0,0,0,0.5)',
      position: 'relative'
    };

    return (
      <div className="rework--workpad" style={style}>
        {this.props.children}
      </div>
    );
  }
});
