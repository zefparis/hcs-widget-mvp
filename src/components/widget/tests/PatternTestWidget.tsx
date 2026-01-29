'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { WidgetTestConfig } from '@/types/widgets';

interface Props {
  config: WidgetTestConfig;
  onComplete: (data: PatternResult) => void;
}

interface Trial {
  pattern: number[];
  selectedPattern: number[];
  correct: boolean;
}

interface PatternResult {
  trials: Trial[];
  completed: boolean;
  score: number;
  duration: number;
}

export function PatternTestWidget({ config, onComplete }: Props) {
  const [currentTrial, setCurrentTrial] = useState(0);
  const [trials, setTrials] = useState<Trial[]>([]);
  const [pattern, setPattern] = useState<number[]>([]);
  const [selectedCells, setSelectedCells] = useState<number[]>([]);
  const [showPattern, setShowPattern] = useState(false);
  const [started, setStarted] = useState(false);
  const [startTime, setStartTime] = useState(0);

  const totalTrials = config.trials || 5;
  const gridSize = 9;

  const generatePattern = () => {
    const difficulty = config.difficulty || 'medium';
    const patternLength = difficulty === 'easy' ? 3 : difficulty === 'hard' ? 5 : 4;
    
    const newPattern: number[] = [];
    while (newPattern.length < patternLength) {
      const cell = Math.floor(Math.random() * gridSize);
      if (!newPattern.includes(cell)) {
        newPattern.push(cell);
      }
    }
    return newPattern;
  };

  const handleStart = () => {
    setStarted(true);
    setStartTime(Date.now());
    const newPattern = generatePattern();
    setPattern(newPattern);
    setShowPattern(true);
    
    setTimeout(() => {
      setShowPattern(false);
    }, 2000);
  };

  const handleCellClick = (index: number) => {
    if (showPattern) return;
    
    if (selectedCells.includes(index)) {
      setSelectedCells(selectedCells.filter(i => i !== index));
    } else {
      setSelectedCells([...selectedCells, index]);
    }
  };

  const handleSubmit = () => {
    const correct = 
      pattern.length === selectedCells.length &&
      pattern.every(cell => selectedCells.includes(cell));

    const newTrial: Trial = {
      pattern,
      selectedPattern: selectedCells,
      correct,
    };

    const newTrials = [...trials, newTrial];
    setTrials(newTrials);

    if (currentTrial + 1 < totalTrials) {
      setCurrentTrial(currentTrial + 1);
      setSelectedCells([]);
      const newPattern = generatePattern();
      setPattern(newPattern);
      setShowPattern(true);
      setTimeout(() => {
        setShowPattern(false);
      }, 2000);
    } else {
      const duration = Date.now() - startTime;
      const correctCount = newTrials.filter(t => t.correct).length;
      const accuracy = correctCount / totalTrials;
      const completed = accuracy >= 0.4;
      
      const baseScore = Math.round(accuracy * 100);
      const score = Math.min(90, Math.max(70, baseScore + Math.floor(Math.random() * 5 - 2)));

      onComplete({
        trials: newTrials,
        completed,
        score,
        duration,
      });
    }
  };

  if (!started) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-2">Test de Reconnaissance de Motifs</h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Mémorisez les cellules colorées puis reproduisez le motif
          </p>
        </div>

        <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium text-blue-900 dark:text-blue-100">Instructions :</p>
          <ol className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-decimal list-inside">
            <li>Un motif de cellules colorées apparaîtra pendant 2 secondes</li>
            <li>Mémorisez la position des cellules</li>
            <li>Reproduisez le motif en cliquant sur les cellules</li>
            <li>Cliquez sur "Valider" pour confirmer votre réponse</li>
          </ol>
        </div>

        <Button onClick={handleStart} className="w-full" size="lg">
          Commencer le test
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">
          {showPattern ? 'Mémorisez le motif' : 'Reproduisez le motif'}
        </h3>
        <span className="text-sm text-zinc-500">
          Essai {currentTrial + 1}/{totalTrials}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
        {Array.from({ length: gridSize }).map((_, index) => {
          const isPattern = pattern.includes(index);
          const isSelected = selectedCells.includes(index);
          
          return (
            <button
              key={index}
              onClick={() => handleCellClick(index)}
              disabled={showPattern}
              className={`
                aspect-square rounded-lg border-2 transition-all
                ${showPattern && isPattern 
                  ? 'bg-blue-500 border-blue-600' 
                  : isSelected
                  ? 'bg-blue-400 border-blue-500'
                  : 'bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 hover:border-blue-400'
                }
                ${showPattern ? 'cursor-not-allowed' : 'cursor-pointer'}
              `}
            />
          );
        })}
      </div>

      {!showPattern && (
        <Button 
          onClick={handleSubmit} 
          className="w-full"
          disabled={selectedCells.length === 0}
        >
          Valider
        </Button>
      )}

      {showPattern && (
        <p className="text-center text-sm text-zinc-500">
          Mémorisation en cours...
        </p>
      )}
    </div>
  );
}
