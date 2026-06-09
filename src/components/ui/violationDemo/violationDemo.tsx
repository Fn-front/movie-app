import { useState } from 'react';

interface Props {
  on_click: () => void;
  label: string;
}

export const ViolationDemo = (props: Props) => {
  const [count_value, setCountValue] = useState(0);

  return (
    <div
      onClick={() => {
        setCountValue(count_value + 1);
        props.on_click();
      }}
      style={{
        color: '#ff0000',
        padding: '10px',
        fontSize: '14px',
      }}
    >
      {props.label}: {count_value}
    </div>
  );
};
