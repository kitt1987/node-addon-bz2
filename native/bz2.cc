#include <node.h>
#include <node_buffer.h>

#include <iostream>

#include "../libbzip2/bzlib.h"

using v8::FunctionCallbackInfo;
using v8::Isolate;
using v8::Local;
using v8::Object;
using v8::String;
using v8::Value;
using v8::Exception;
using v8::MaybeLocal;
using v8::External;
using v8::Function;
using v8::Null;
using v8::Number;
using v8::Array;
using v8::EscapableHandleScope;
using v8::Boolean;

using namespace node;

namespace bz2_addon {

static Local<Object> buildReturnValue(Isolate* isolate, bz_stream const* bzs,
    size_t out_buf_size, bool reachEnd = false) {
  EscapableHandleScope scope(isolate);
  Local<Object> returnValue = Object::New(isolate);
  returnValue->Set(String::NewFromUtf8(isolate, "in"),
    Number::New(isolate, bzs->avail_in));
  returnValue->Set(String::NewFromUtf8(isolate, "out"),
    Number::New(isolate, out_buf_size - bzs->avail_out));
  if (reachEnd) {
    returnValue->Set(String::NewFromUtf8(isolate, "reachEnd"),
      Boolean::New(isolate, reachEnd));
  }

  return scope.Escape(returnValue);
}

void compressInit(const FunctionCallbackInfo<Value>& args) {
	Isolate* isolate = args.GetIsolate();

  bz_stream* bzs = (bz_stream*)calloc(1, sizeof(bz_stream));
  if (bzs == NULL) {
    isolate->ThrowException(Exception::TypeError(
        String::NewFromUtf8(
          isolate, "Fail to alloca memory."
        )));
    return;
  }

  int result = BZ2_bzCompressInit(bzs, 2, 0, 30);
  if (result != BZ_OK) {
    std::cerr << "Fail to initialize bz2 caused by " << result << std::endl;
    isolate->ThrowException(Exception::TypeError(
        String::NewFromUtf8(
          isolate, "Fail to initial bz2."
        )));
    return;
  }

  args.GetReturnValue().Set(External::New(isolate, bzs));
}

void compress(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  if (args.Length() < 3) {
    isolate->ThrowException(Exception::TypeError(
        String::NewFromUtf8(
          isolate, "You have to set the bzip2 stream, input buffer"
          " and callback to write compressed data."
        )));
    return;
  }

  if (!args[0]->IsExternal()) {
    isolate->ThrowException(Exception::TypeError(
        String::NewFromUtf8(
          isolate, "The bzip2 stream is required or you should call"
          " compressInit first."
        )));
    return;
  }

  if (!args[1]->IsString() && !Buffer::HasInstance(args[1])) {
    isolate->ThrowException(Exception::TypeError(
        String::NewFromUtf8(
          isolate, "Things you want to compress have to be String or Buffer."
        )));
    return;
  }

  if (!Buffer::HasInstance(args[2])) {
    isolate->ThrowException(Exception::TypeError(
        String::NewFromUtf8(isolate, "The output buffer is required.")));
    return;
  }

  MaybeLocal<Object> input = args[1]->ToObject();
  Local<Object> inputBuf = input.ToLocalChecked();
  MaybeLocal<Object> output = args[2]->ToObject();
  Local<Object> outputBuf = output.ToLocalChecked();

  bz_stream* bzs = (bz_stream*) Local<External>::Cast(args[0])->Value();
  if (bzs == NULL) {
    isolate->ThrowException(Exception::TypeError(
        String::NewFromUtf8(
          isolate, "You need to call compressInit first."
        )));
    return;
  }

  bzs->next_in = Buffer::Data(inputBuf);
  bzs->avail_in = Buffer::Length(inputBuf);

  size_t out_buf_size = Buffer::Length(outputBuf);
  bzs->next_out = Buffer::Data(outputBuf);
  bzs->avail_out = out_buf_size;

  while (bzs->avail_in > 0) {
    int result = BZ2_bzCompress(bzs, BZ_RUN);
    if (result != BZ_RUN_OK) {
      std::cerr << "Fail to compress caused by " << result << std::endl;
      isolate->ThrowException(Exception::TypeError(
          String::NewFromUtf8(
            isolate, "Fail to compress."
          )));
      return;
    }

    if (bzs->avail_out < out_buf_size) {
      args.GetReturnValue().Set(buildReturnValue(isolate, bzs, out_buf_size));
      return;
    }
  }

  args.GetReturnValue().Set(buildReturnValue(isolate, bzs, out_buf_size));
}

void compressEnd(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  if (args.Length() < 2) {
    isolate->ThrowException(Exception::TypeError(
        String::NewFromUtf8(
          isolate, "You have to set the bzip2 stream, input buffer"
          " and callback to write compressed data."
        )));
    return;
  }

  if (!args[0]->IsExternal()) {
    isolate->ThrowException(Exception::TypeError(
        String::NewFromUtf8(
          isolate, "The bzip2 stream is required or you should call"
          " compressInit first."
        )));
    return;
  }

  if (!Buffer::HasInstance(args[1])) {
    isolate->ThrowException(Exception::TypeError(
        String::NewFromUtf8(isolate, "The output buffer is required.")));
    return;
  }

  bz_stream* bzs = (bz_stream*) Local<External>::Cast(args[0])->Value();
  MaybeLocal<Object> output = args[1]->ToObject();
  Local<Object> outputBuf = output.ToLocalChecked();
  size_t out_buf_size = Buffer::Length(outputBuf);
  bzs->next_out = Buffer::Data(outputBuf);
  bzs->avail_out = out_buf_size;

  int result = BZ_OK;

  while (result != BZ_STREAM_END) {
    result = BZ2_bzCompress(bzs, BZ_FINISH);
    if (result != BZ_FINISH_OK && result != BZ_STREAM_END) {
      std::cerr << "Fail to finish compress caused by " << result << std::endl;
      isolate->ThrowException(Exception::TypeError(
          String::NewFromUtf8(isolate, "Fail to compress."))
      );
      return;
    }

    if (bzs->avail_out < out_buf_size) {
      args.GetReturnValue().Set(buildReturnValue(isolate, bzs, out_buf_size,
        result == BZ_STREAM_END));
      return;
    }
  }

  BZ2_bzCompressEnd(bzs);
  free(bzs);
}

void decompressInit(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();

  bz_stream* bzs = (bz_stream*)calloc(1, sizeof(bz_stream));
  if (bzs == NULL) {
    isolate->ThrowException(Exception::TypeError(
        String::NewFromUtf8(
          isolate, "Fail to alloca memory."
        )));
    return;
  }

  int result = BZ2_bzDecompressInit(bzs, 0, 1);
  if (result != BZ_OK) {
    std::cerr << "Fail to initialize bz2 caused by " << result << std::endl;
    isolate->ThrowException(Exception::TypeError(
        String::NewFromUtf8(
          isolate, "Fail to initial bz2."
        )));
    return;
  }

  args.GetReturnValue().Set(External::New(isolate, bzs));
}

void decompress(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  if (args.Length() < 3) {
    isolate->ThrowException(Exception::TypeError(
        String::NewFromUtf8(
          isolate, "bzip2 stream, compressed data buffer and output buffer are"
          " required."
        )));
    return;
  }

  if (!args[0]->IsExternal()) {
    isolate->ThrowException(Exception::TypeError(
        String::NewFromUtf8(
          isolate, "You have to indicate the bzip2 stream."
        )));
    return;
  }

  if (!args[1]->IsString() && !Buffer::HasInstance(args[1])) {
    isolate->ThrowException(Exception::TypeError(
        String::NewFromUtf8(
          isolate, "The compressed data must be String or Buffer."
        )));
    return;
  }

  if (!Buffer::HasInstance(args[2])) {
    isolate->ThrowException(Exception::TypeError(
        String::NewFromUtf8(
          isolate, "The output buffer is required"
        )));
    return;
  }

  MaybeLocal<Object> input = args[1]->ToObject();
  Local<Object> inputBuf = input.ToLocalChecked();
  MaybeLocal<Object> output = args[2]->ToObject();
  Local<Object> outputBuf = output.ToLocalChecked();

  bz_stream* bzs = (bz_stream*) Local<External>::Cast(args[0])->Value();
  bzs->next_in = Buffer::Data(inputBuf);
  bzs->avail_in = Buffer::Length(inputBuf);
  size_t out_buf_size = Buffer::Length(outputBuf);
  bzs->next_out = Buffer::Data(outputBuf);
  bzs->avail_out = out_buf_size;

  int result = BZ_OK;
  while (bzs->avail_in > 0 && result != BZ_STREAM_END) {
    result = BZ2_bzDecompress(bzs);
    if (result != BZ_OK && result != BZ_STREAM_END) {
      std::cerr << "Fail to decompress caused by " << result << std::endl;
      isolate->ThrowException(Exception::TypeError(
          String::NewFromUtf8(isolate, "Fail to decompress.")));
      return;
    }

    if (bzs->avail_out < out_buf_size) {
      args.GetReturnValue().Set(buildReturnValue(isolate, bzs, out_buf_size,
        result == BZ_STREAM_END));
      return;
    }
  }

  args.GetReturnValue().Set(buildReturnValue(isolate, bzs, out_buf_size,
        result == BZ_STREAM_END));
}

void decompressEnd(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  if (args.Length() < 1) {
    isolate->ThrowException(Exception::TypeError(
        String::NewFromUtf8(
          isolate, "You have to set the bzip2 stream and callback to write"
          " compressed data."
        )));
    return;
  }

  if (!args[0]->IsExternal()) {
    isolate->ThrowException(Exception::TypeError(
        String::NewFromUtf8(
          isolate, "You have to indicate the bzip2 stream."
        )));
    return;
  }

  bz_stream* bzs = (bz_stream*) Local<External>::Cast(args[0])->Value();
  BZ2_bzDecompressEnd(bzs);
  free(bzs);
}

void init(Local<Object> exports) {
	NODE_SET_METHOD(exports, "compressInit", compressInit);
	NODE_SET_METHOD(exports, "compress", compress);
  NODE_SET_METHOD(exports, "compressEnd", compressEnd);
  NODE_SET_METHOD(exports, "decompressInit", decompressInit);
  NODE_SET_METHOD(exports, "decompress", decompress);
  NODE_SET_METHOD(exports, "decompressEnd", decompressEnd);
}

NODE_MODULE(bzip2_addon, init)

}