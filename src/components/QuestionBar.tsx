import Image from 'next/image';

interface QuestionBarProps {
  onQuestionClick: (question: string) => void;
  className?: string;
}

const QUESTIONS = [
  'Can you tell me more about Studio Graphene?',
  'What AI services do you currently offer?',
  'What technologies do you use?',
];

const SEPARATORS = [
  '/images/icons/blue.svg',
  '/images/icons/green.svg',
  '/images/icons/yellow.svg',
  '/images/icons/pink.svg',
];

export function QuestionBar({ onQuestionClick, className = '' }: QuestionBarProps) {
  const renderQuestionSet = (startIndex: number) => (
    <>
      {QUESTIONS.map((question, index) => {
        const actualIndex = (startIndex + index) % QUESTIONS.length;
        const separatorIndex = (startIndex + index) % SEPARATORS.length;

        return (
          <div key={`${startIndex}-${index}`} className="flex items-center">
            <div
              className="inline-flex flex-shrink-0 cursor-pointer items-center px-6 text-center transition-colors hover:bg-gray-800"
              onClick={() => onQuestionClick(question)}
            >
              <span className="text-[22px]">{question}</span>
            </div>
            {/* {index < QUESTIONS.length - 1 && ( */}
            <div className="mx-4 flex items-center">
              <div className="flex h-6 w-6 items-center justify-center rounded-full">
                <Image
                  src={SEPARATORS[separatorIndex]}
                  alt="separator"
                  className="h-4 w-4"
                  width={16}
                  height={16}
                />
              </div>
            </div>
            {/* )} */}
          </div>
        );
      })}
    </>
  );

  return (
    <div className={`fixed right-0 bottom-0 left-0 z-30 ${className}`}>
      <div className="font-founders bg-chat-primary h-[36px] overflow-hidden">
        <div className="sliding-questions flex h-full items-center text-[22px] font-light whitespace-nowrap">
          {/* Render multiple sets for seamless looping */}
          {renderQuestionSet(0)}
          {renderQuestionSet(1)}
          {renderQuestionSet(2)}
        </div>
      </div>
    </div>
  );
}
