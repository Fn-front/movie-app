import { render, fireEvent } from '@testing-library/react';
import { useRef } from 'react';

import { useClickOutside } from './useClickOutside';

function TestComponent({ callback }: { callback: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, callback);
  return (
    <div ref={ref} data-testid='inside'>
      Inside
    </div>
  );
}

describe('useClickOutside', () => {
  it('要素の外側クリックでcallbackが呼ばれる', () => {
    const callback = jest.fn();
    render(<TestComponent callback={callback} />);

    fireEvent.mouseDown(document.body);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('要素の内側クリックでcallbackが呼ばれない', () => {
    const callback = jest.fn();
    const { getByTestId } = render(<TestComponent callback={callback} />);

    fireEvent.mouseDown(getByTestId('inside'));

    expect(callback).not.toHaveBeenCalled();
  });

  it('アンマウント時にイベントリスナーが解除される', () => {
    const callback = jest.fn();
    const removeEventListenerSpy = jest.spyOn(document, 'removeEventListener');

    const { unmount } = render(<TestComponent callback={callback} />);

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'mousedown',
      expect.any(Function),
    );
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'touchstart',
      expect.any(Function),
    );

    removeEventListenerSpy.mockRestore();
  });
});
