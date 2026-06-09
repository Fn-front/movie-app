import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ViolationDemo } from './violationDemo';

describe('ViolationDemo', () => {
  it('renders label and initial count', () => {
    render(<ViolationDemo label='test' on_click={() => {}} />);
    expect(screen.getByText(/test: 0/)).toBeInTheDocument();
  });

  it('increments count and calls on_click on click', async () => {
    const onClickMock = jest.fn();
    const user = userEvent.setup();
    render(<ViolationDemo label='test' on_click={onClickMock} />);
    await user.click(screen.getByText(/test: 0/));
    expect(screen.getByText(/test: 1/)).toBeInTheDocument();
    expect(onClickMock).toHaveBeenCalledTimes(1);
  });
});
