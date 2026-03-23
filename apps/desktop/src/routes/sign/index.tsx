import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TextFieldType, useSigningStore } from '../../store/signing';
import { useSign } from '../../hooks/useSign';
import SignatureManager from '../../components/SignatureManager';
import SignaturePlacer from '../../components/SignaturePlacer';
import SigningProgress from './SigningProgress';

type PlacementMode = 'signature' | 'textField';

export default function SignPage() {
  const navigate = useNavigate();
  const {
    filePath,
    fileName,
    signatureBase64,
    signaturePlacements,
    textFieldPlacements,
    error,
    setSignature,
    addSignaturePlacement,
    updateSignaturePlacement,
    removeSignaturePlacement,
    clearSignaturePlacements,
    addTextField,
    updateTextField,
    removeTextField,
  } = useSigningStore();
  const { signingStep, startSigning } = useSign();
  const [showConfirm, setShowConfirm] = useState(false);
  const [placementMode, setPlacementMode] = useState<PlacementMode>('signature');
  const [pendingFieldType, setPendingFieldType] = useState<TextFieldType>('text');
  const [pendingFontSize, setPendingFontSize] = useState(12);

  if (signingStep !== 'idle' && signingStep !== 'error') {
    return <SigningProgress />;
  }

  const canSign = filePath && signatureBase64 && signaturePlacements.length > 0;
  const nonEmptyTextFields = textFieldPlacements.filter(
    (tf) => tf.text.trim().length > 0,
  );

  return (
    <div className="flex h-screen">
      {/* Left panel */}
      <div className="w-80 p-6 border-r border-gray-200 flex flex-col overflow-auto">
        <button
          onClick={() => navigate('/upload')}
          className="bg-transparent border-none cursor-pointer mb-4 text-left text-brand-700"
        >
          &larr; Back
        </button>

        <h2 className="text-xl mb-1">Sign Document</h2>
        <p className="text-gray-500 mb-4 text-sm">{fileName}</p>

        {/* Mode toggle */}
        <div className="flex rounded-lg overflow-hidden border border-gray-300 mb-5">
          <button
            onClick={() => setPlacementMode('signature')}
            className={`flex-1 py-2 text-[13px] border-none cursor-pointer ${
              placementMode === 'signature'
                ? 'font-semibold bg-brand-700 text-white'
                : 'font-normal bg-white text-gray-700'
            }`}
          >
            Signature
          </button>
          <button
            onClick={() => setPlacementMode('textField')}
            className={`flex-1 py-2 text-[13px] border-none cursor-pointer ${
              placementMode === 'textField'
                ? 'font-semibold bg-brand-600 text-white'
                : 'font-normal bg-white text-gray-700'
            }`}
          >
            Text Field
          </button>
        </div>

        {/* Signature mode content */}
        {placementMode === 'signature' && (
          <>
            <SignatureManager
              onSignatureSelected={(base64) => {
                setSignature(base64);
                clearSignaturePlacements();
              }}
            />

            {/* Draggable signature thumbnail */}
            {signatureBase64 && (
              <div className="mt-5">
                <p className="text-xs text-gray-500 mb-1.5">
                  Drag to place on PDF
                </p>
                <div
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', 'signature');
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  className="border-2 border-dashed border-brand-700 rounded-lg p-2 cursor-grab bg-brand-50 flex items-center justify-center"
                >
                  <img
                    src={`data:image/png;base64,${signatureBase64}`}
                    alt="Drag signature"
                    draggable={false}
                    className="max-w-full max-h-[60px] object-contain"
                  />
                </div>
              </div>
            )}
          </>
        )}

        {/* Text field mode content */}
        {placementMode === 'textField' && (
          <div>
            {/* Field type selector */}
            <div className="mb-3">
              <label className="text-xs text-gray-700 block mb-1">
                Field type
              </label>
              <div className="flex gap-2">
                {(['text', 'date'] as TextFieldType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => setPendingFieldType(type)}
                    className={`flex-1 px-3 py-1.5 text-[13px] rounded-md border cursor-pointer capitalize ${
                      pendingFieldType === type
                        ? 'border-brand-600 bg-brand-50 text-brand-600'
                        : 'border-gray-300 bg-white text-gray-700'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Font size selector */}
            <div className="mb-3">
              <label className="text-xs text-gray-700 block mb-1">
                Font size
              </label>
              <select
                value={pendingFontSize}
                onChange={(e) => setPendingFontSize(Number(e.target.value))}
                className="w-full px-2 py-1.5 text-[13px] rounded-md border border-gray-300 bg-white"
              >
                {[10, 12, 14, 16, 18].map((size) => (
                  <option key={size} value={size}>
                    {size}pt
                  </option>
                ))}
              </select>
            </div>

            {/* Draggable text field */}
            <div className="mt-2">
              <p className="text-xs text-gray-500 mb-1.5">
                Drag to place on PDF
              </p>
              <div
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', 'textField');
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                className="border-2 border-dashed border-brand-600 rounded-lg px-4 py-2.5 cursor-grab bg-brand-50 flex items-center justify-center text-[13px] text-brand-600 font-medium"
              >
                {pendingFieldType === 'date' ? 'Date Field' : 'Text Field'}
              </div>
            </div>
          </div>
        )}

        {/* Signature placement list */}
        {signaturePlacements.length > 0 && (
          <div className="mt-5">
            <h4 className="text-sm mb-2 text-gray-700">
              Signatures ({signaturePlacements.length})
            </h4>
            <ul className="list-none p-0 m-0">
              {signaturePlacements.map((p, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between px-2 py-1.5 text-[13px] bg-green-50 rounded-md mb-1 border-l-[3px] border-l-green-600"
                >
                  <span>Page {p.pageNumber}</span>
                  <button
                    onClick={() => removeSignaturePlacement(i)}
                    className="bg-transparent border-none text-red-500 cursor-pointer text-[13px] px-1.5 py-0.5"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Text field placement list */}
        {textFieldPlacements.length > 0 && (
          <div className="mt-3">
            <h4 className="text-sm mb-2 text-gray-700">
              Text Fields ({textFieldPlacements.length})
            </h4>
            <ul className="list-none p-0 m-0">
              {textFieldPlacements.map((tf) => (
                <li
                  key={tf.id}
                  className="flex items-center justify-between px-2 py-1.5 text-[13px] bg-brand-50 rounded-md mb-1 border-l-[3px] border-l-brand-600"
                >
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap max-w-[180px]">
                    P{tf.pageNumber}: {tf.text || `(${tf.fieldType})`}
                  </span>
                  <button
                    onClick={() => removeTextField(tf.id)}
                    className="bg-transparent border-none text-red-500 cursor-pointer text-[13px] px-1.5 py-0.5 shrink-0"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex-1" />

        {placementMode === 'signature' && signatureBase64 && (
          <p className="text-gray-400 text-xs mt-2">
            {signaturePlacements.length === 0
              ? 'Drag your signature onto the PDF to place it.'
              : 'Click a placement to move, resize, or delete it.'}
          </p>
        )}

        {placementMode === 'textField' && (
          <p className="text-gray-400 text-xs mt-2">
            Drag a field onto the PDF. Double-click to edit its text.
          </p>
        )}

        {/* Sign button */}
        <button
          onClick={() => setShowConfirm(true)}
          disabled={!canSign}
          className={`px-6 py-3 text-sm text-white border-none rounded-lg mt-3 ${
            canSign
              ? 'bg-brand-700 hover:bg-brand-800 cursor-pointer'
              : 'bg-gray-300 cursor-default'
          }`}
        >
          Sign &amp; Anchor
        </button>

        {error && (
          <div className="mt-3 p-3 bg-red-50 rounded-lg text-red-500 text-[13px]">
            Error: {error}
          </div>
        )}
      </div>

      {/* Right panel — PDF with placement overlay */}
      <div className="flex-1 flex bg-gray-50 overflow-hidden p-0">
        {filePath ? (
          <SignaturePlacer
            filePath={filePath}
            signatureBase64={signatureBase64}
            placements={signaturePlacements}
            onPlacementAdded={addSignaturePlacement}
            onPlacementUpdated={updateSignaturePlacement}
            onPlacementRemoved={removeSignaturePlacement}
            placementMode={placementMode}
            textFields={textFieldPlacements}
            pendingFieldType={pendingFieldType}
            pendingFontSize={pendingFontSize}
            onTextFieldAdded={addTextField}
            onTextFieldUpdated={updateTextField}
            onTextFieldRemoved={removeTextField}
          />
        ) : (
          <p className="text-gray-400">No document loaded</p>
        )}
      </div>

      {/* Confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
          <div className="bg-white rounded-xl p-8 max-w-[400px] w-full">
            <h3 className="mb-3">Confirm Signing</h3>
            <p className="text-gray-500 mb-6 text-sm">
              This will embed your signature at {signaturePlacements.length} location
              {signaturePlacements.length !== 1 ? 's' : ''}
              {nonEmptyTextFields.length > 0 && (
                <> and {nonEmptyTextFields.length} text field
                {nonEmptyTextFields.length !== 1 ? 's' : ''}</>
              )}
              , compute a hash, and anchor it on-chain. This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-5 py-2 bg-gray-100 border-none rounded-md cursor-pointer text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false);
                  startSigning();
                }}
                className="px-5 py-2 bg-brand-700 hover:bg-brand-800 text-white border-none rounded-md cursor-pointer"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
